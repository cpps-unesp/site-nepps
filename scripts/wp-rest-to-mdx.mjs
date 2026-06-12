#!/usr/bin/env node
/**
 * Migra o conteúdo público do WordPress → MDX via REST API.
 *
 * Alternativa ao wp-to-mdx.mjs (WXR) quando não há export disponível:
 * busca páginas e posts publicados em `${WP_BASE}/wp-json/wp/v2/…`,
 * converte o HTML renderizado em Markdown (Turndown) e grava nas
 * collections. Imagens hospedadas no WP são reescritas para
 * `/imagens/wp/<arquivo>` e registradas em `scripts/wp-images.json`
 * (baixadas por download-wp-images.mjs).
 *
 * Páginas cujo slug colide com rotas estáticas do Astro (home, noticias,
 * equipe, busca) vão para `src/content/_wp-raw/` para curadoria manual —
 * esse diretório não é carregado por nenhuma collection.
 *
 * Uso:
 *   node scripts/wp-rest-to-mdx.mjs [--no-images]
 *   WP_BASE=https://outro.site node scripts/wp-rest-to-mdx.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';
import { downloadImages } from './download-wp-images.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WP_BASE = (process.env.WP_BASE ?? 'https://nepps.org').replace(/\/+$/, '');
const WP_HOST = new URL(WP_BASE).host.replace(/^www\./, '');
const noImages = process.argv.includes('--no-images');
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const ONLY = new Set(
  (onlyArg?.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf('--only') + 1] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// slugs que colidem com rotas estáticas do Astro
const RESERVED_SLUGS = new Set(['home', 'inicio', 'noticias', 'equipe', 'busca']);

// ordem das páginas (menus/listagens); demais recebem o default do schema
const PAGE_ORDER = {
  institucional: 10,
  pesquisas: 20,
  publicacoes: 30,
};

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
});

// Blocos de layout do Gutenberg (colunas, media-text, separadores) são
// mantidos como HTML cru no markdown — o CSS de src/styles/global.css
// reproduz o layout original (ex.: fotos ao lado do texto na equipe).
td.keep((node) => {
  const cls = node.getAttribute?.('class') ?? '';
  return /\bwp-block-(columns|media-text|group|separator)\b/.test(cls);
});

// Preserva figuras (com legenda e link envolvente, ex.: badges Lattes/ORCID)
td.addRule('figure', {
  filter: 'figure',
  replacement(content, node) {
    const img = node.querySelector?.('img');
    const cap = node.querySelector?.('figcaption');
    if (!img) return content;
    const src = img.getAttribute('src') ?? '';
    const alt = (img.getAttribute('alt') ?? '').replace(/[\[\]]/g, '');
    const caption = cap ? cap.textContent.trim() : '';
    const anchor = img.closest?.('a');
    const href = anchor?.getAttribute('href') ?? '';
    let image = `![${alt || caption}](${src})`;
    if (href) image = `[${image}](${href})`;
    return `\n\n${image}${caption ? `\n\n*${caption}*` : ''}\n\n`;
  },
});

async function fetchAll(type) {
  const out = [];
  for (let page = 1; ; page++) {
    const url = `${WP_BASE}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_embed=1`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (res.status === 400 && page > 1) break; // além da última página
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const batch = await res.json();
    out.push(...batch);
    const totalPages = Number(res.headers.get('x-wp-totalpages') ?? 1);
    if (page >= totalPages) break;
  }
  return out;
}

async function main() {
  console.log(`> Buscando conteúdo publicado em ${WP_BASE}/wp-json/…`);
  const [pages, posts] = await Promise.all([fetchAll('pages'), fetchAll('posts')]);
  console.log(`  ${pages.length} páginas, ${posts.length} posts`);

  // mapa de rotas internas: caminho antigo no WP → caminho novo
  const internalRoutes = new Map([
    ['', '/pt/'],
    ['home', '/pt/'],
    ['noticias', '/pt/noticias/'],
  ]);
  for (const p of pages) internalRoutes.set(p.slug, `/pt/${p.slug}/`);
  for (const p of posts) internalRoutes.set(p.slug, `/pt/noticias/${p.slug}/`);

  const imageJobs = new Map(); // url remota → /imagens/wp/<arquivo>
  const stats = { paginas: 0, noticias: 0, raw: 0 };

  for (const item of pages) {
    if (ONLY.size && !ONLY.has(item.slug)) continue;
    if (item.parent) {
      console.log(`  ! página "${item.slug}" tem parent=${item.parent} — gravando plana`);
    }
    await writeEntry({ item, isNews: false, internalRoutes, imageJobs, stats });
  }
  for (const item of posts) {
    if (ONLY.size && !ONLY.has(item.slug)) continue;
    await writeEntry({ item, isNews: true, internalRoutes, imageJobs, stats });
  }

  // manifest para download posterior (local ou no CI); preserva entradas anteriores
  const manifestPath = path.join(__dirname, 'wp-images.json');
  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {}
  for (const [url, local] of imageJobs) manifest[url] = local;
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(manifestPath, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\n> Manifest de imagens: scripts/wp-images.json (${Object.keys(sorted).length} imagens)`);

  if (!noImages && Object.keys(sorted).length > 0) {
    console.log(`\n> Baixando imagens…`);
    await downloadImages(Object.entries(sorted));
  } else if (noImages) {
    console.log(`> --no-images: pulando download`);
  }

  console.log(
    `\n✓ Concluído: ${stats.paginas} páginas, ${stats.noticias} notícias, ${stats.raw} em _wp-raw (curadoria manual)`,
  );
}

async function writeEntry({ item, isNews, internalRoutes, imageJobs, stats }) {
  const title = plainText(item.title?.rendered ?? item.slug);
  const wpSlug = item.slug;
  const slug = cleanSlug(wpSlug);
  const date = new Date((item.date_gmt ?? item.date) + 'Z');
  const updated = new Date((item.modified_gmt ?? item.modified ?? item.date_gmt) + 'Z');

  const html = item.content?.rendered ?? '';
  let md = td.turndown(preClean(html)).trim();
  md = rewriteInternalLinks(md, internalRoutes);

  const { md: mdImages, images } = rewriteImageUrls(md);
  md = mdImages;
  for (const [url, local] of images) imageJobs.set(url, local);
  // imagens dentro de HTML mantido (blocos Gutenberg)
  md = md
    .replace(/\s+(?:srcset|sizes)="[^"]*"/g, '')
    .replace(/(src=")(https?:[^"]+)(")/g, (m, a, url, b) => {
      if (!isWpAsset(url)) return m;
      const local = `/imagens/wp/${path.basename(new URL(url).pathname)}`;
      imageJobs.set(url, local);
      return a + local + b;
    });

  let description = '';
  let image = featuredImage(item, imageJobs);
  if (!isNews) {
    ({ md, description } = stripLeadingHeading(md, title));
  } else if (!image) {
    ({ md, image } = extractLeadingImage(md));
  }

  const excerpt = plainText(item.excerpt?.rendered ?? '') || extractExcerpt(md);
  const tags = isNews ? termNames(item) : [];

  const fm = buildFrontMatter({
    title,
    slug,
    wpSlug,
    date,
    updated,
    description,
    excerpt,
    image,
    tags,
    order: PAGE_ORDER[slug],
    isNews,
    originalUrl: item.link,
  });

  const reserved = !isNews && RESERVED_SLUGS.has(slug);
  const outDir = reserved
    ? path.join(ROOT, 'src', 'content', '_wp-raw')
    : path.join(ROOT, 'src', 'content', isNews ? 'noticias' : 'paginas', 'pt');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slug}.md`);
  await fs.writeFile(outFile, fm + '\n\n' + md + '\n');
  stats[reserved ? 'raw' : isNews ? 'noticias' : 'paginas']++;
  console.log(`  ✓ ${path.relative(ROOT, outFile)}`);
}

function featuredImage(item, imageJobs) {
  const media = item._embedded?.['wp:featuredmedia']?.[0]?.source_url;
  if (!media || !isWpAsset(media)) return media ?? '';
  const local = `/imagens/wp/${path.basename(new URL(media).pathname)}`;
  imageJobs.set(media, local);
  return local;
}

function termNames(item) {
  const groups = item._embedded?.['wp:term'] ?? [];
  return groups
    .flat()
    .filter((t) => t?.name && t.taxonomy !== 'post_format')
    .map((t) => plainText(t.name).toLowerCase());
}

function isWpAsset(url) {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') === WP_HOST && u.pathname.includes('/wp-content/');
  } catch {
    return false;
  }
}

function preClean(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/\[\/?(?:caption|gallery|embed|vc_[^\]]+)[^\]]*\]/g, '')
    .replace(/\s+data-[a-z0-9_-]+="[^"]*"/gi, '');
}

function rewriteInternalLinks(md, internalRoutes) {
  const host = WP_HOST.replace(/\./g, '\\.');
  const re = new RegExp(`\\]\\((https?://(?:www\\.)?${host}[^)\\s]*)\\)`, 'g');
  return md.replace(re, (m, url) => {
    const { pathname } = new URL(url);
    if (pathname.includes('/wp-content/')) return m; // imagens: tratadas à parte
    const slug = pathname.replace(/^\/+|\/+$/g, '');
    const target = internalRoutes.get(slug);
    return target ? `](${target})` : m;
  });
}

function rewriteImageUrls(md) {
  const images = new Map();
  const re = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  const out = md.replace(re, (m, alt, url) => {
    if (!isWpAsset(url)) return m; // mantém externos
    const file = path.basename(new URL(url).pathname);
    const localUrl = `/imagens/wp/${file}`;
    images.set(url, localUrl);
    return `![${alt}](${localUrl})`;
  });
  return { md: out, images };
}

// Remove o h1/h2 inicial que repete o título (layout já o exibe) e captura
// o subtítulo curto seguinte como description.
function stripLeadingHeading(md, title) {
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const heading = lines[i]?.replace(/^#+\s*/, '').trim() ?? '';
  if (!/^#{1,2}\s+/.test(lines[i] ?? '') || normalize(heading) !== normalize(title)) {
    return { md, description: '' };
  }
  i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  let description = '';
  const next = lines[i]?.trim() ?? '';
  if (next && next.length <= 120 && !/^[#\-!\[>*]|\]\(/.test(next)) {
    description = next;
    i++;
  }
  return { md: lines.slice(i).join('\n').trim(), description };
}

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Para notícias sem featured image: primeira imagem do corpo vira `image`.
function extractLeadingImage(md) {
  const m = md.match(/^(?:\[)?!\[[^\]]*\]\(([^)\s]+)\)(?:\]\([^)\s]+\))?\s*/);
  if (!m) return { md, image: '' };
  return { md: md.slice(m[0].length).trim(), image: m[1] };
}

// Slugs do WP vêm percent-encoded (emojis e acentos viram %xx); normaliza
// para kebab-case ASCII. Mantém wpSlug original para referência.
function cleanSlug(slug) {
  let s = slug;
  try {
    s = decodeURIComponent(s);
  } catch {}
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || slug.replace(/%[0-9a-f]{2}/gi, '')
  );
}

function plainText(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function extractExcerpt(md, max = 200) {
  const plain = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max).replace(/\s\S*$/, '') + '…';
}

function buildFrontMatter({ title, slug, wpSlug, date, updated, description, excerpt, image, tags, order, isNews, originalUrl }) {
  const lines = [
    '---',
    `title: ${yamlString(title)}`,
    `slug: ${slug}`,
    `lang: pt`,
    `wpSlug: ${wpSlug}`,
  ];
  if (isNews) {
    lines.push(`date: ${date.toISOString()}`);
    if (excerpt) lines.push(`excerpt: ${yamlString(excerpt)}`);
    if (image) lines.push(`image: ${yamlString(image)}`);
    lines.push(`tags: ${JSON.stringify(tags)}`);
  } else {
    if (description) lines.push(`description: ${yamlString(description)}`);
    if (order != null) lines.push(`order: ${order}`);
    lines.push(`updated: ${updated.toISOString()}`);
  }
  if (originalUrl) lines.push(`# original: ${originalUrl}`);
  lines.push('---');
  return lines.join('\n');
}

function yamlString(s) {
  const safe = String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${safe}"`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
