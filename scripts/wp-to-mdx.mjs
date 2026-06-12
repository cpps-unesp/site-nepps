#!/usr/bin/env node
/**
 * Conversor WordPress (WXR XML) → MDX para o site NEPPS.
 *
 * Lê o export do WP em `nepps.WordPress.*.xml`, gera arquivos MDX em:
 *   - src/content/paginas/<lang>/<slug>.mdx
 *   - src/content/noticias/<lang>/<slug>.mdx
 *
 * Reescreve links internos (nepps.org/<slug>) para as rotas novas
 * (/<lang>/<slug>/), corrige aspas corrompidas do export, remove o
 * cabeçalho do Elementor vazado no conteúdo e gera o manifest de imagens
 * em `scripts/wp-images.json` (consumido por download-wp-images.mjs).
 *
 * Uso:
 *   node scripts/wp-to-mdx.mjs [caminho-do-xml]
 *   node scripts/wp-to-mdx.mjs --no-images   # pula download
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';
import { downloadImages } from './download-wp-images.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const noImages = args.includes('--no-images');
const xmlPath = args.find((a) => !a.startsWith('--')) ?? findDefaultXml();

function findDefaultXml() {
  // TODO(nepps): apontar para o export WXR do nepps.org (Ferramentas → Exportar no WP).
  return path.join(ROOT, 'nepps.WordPress.xml');
}

// páginas geradas dinamicamente pelo Astro — não viram MDX
// (home → [lang]/index.astro; noticias → [lang]/noticias/index.astro;
//  equipe → [lang]/equipe.astro a partir da collection src/content/equipe/)
const SKIP_PAGE_SLUGS = new Set(['home', 'noticias', 'equipe']);

// remapeia slugs do WP para slug/idioma/título novos, quando necessário.
// Ex.: { 'sobre-nos': { slug: 'institucional', lang: 'pt', title: 'Institucional' } }
const slugRemap = {};

// ordem das páginas (menus/listagens); demais recebem o default do schema.
// TODO(nepps): ajustar conforme as páginas reais do nepps.org.
const PAGE_ORDER = {
  institucional: 10,
  pesquisas: 20,
  publicacoes: 30,
  equipe: 40,
};

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
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

async function main() {
  console.log(`> Lendo ${path.relative(ROOT, xmlPath)}`);
  const xml = await fs.readFile(xmlPath, 'utf8');

  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: '__cdata',
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const items = toArray(doc?.rss?.channel?.item);

  // 1º passe: coleta entradas publicadas para mapear links internos
  const entries = [];
  for (const item of items) {
    const postType = cdata(item['wp:post_type']);
    const status = cdata(item['wp:status']);
    if (status !== 'publish') continue;
    if (postType !== 'page' && postType !== 'post') continue;

    const title = cdata(item.title);
    const wpSlug = (cdata(item['wp:post_name']) || slugify(title)).toLowerCase();
    if (!wpSlug) continue;

    // site nasce só em português; ao internacionalizar, detectar o idioma aqui
    // (ex.: sufixo de slug) e acrescentá-lo a langField/translations.
    let lang = 'pt';
    let slug = wpSlug;
    let finalTitle = title;
    if (slugRemap[wpSlug]) {
      ({ slug, lang } = slugRemap[wpSlug]);
      finalTitle = slugRemap[wpSlug].title ?? title;
    }

    const isNews = postType === 'post';
    entries.push({ item, wpSlug, slug, lang, isNews, title: finalTitle });
  }

  // mapa de rotas internas: slug original do WP → caminho novo
  const internalRoutes = new Map([
    ['', '/pt/'],
    ['home', '/pt/'],
    ['noticias', '/pt/noticias/'],
  ]);
  for (const e of entries) {
    const target = e.isNews ? `/${e.lang}/noticias/${e.slug}/` : `/${e.lang}/${e.slug}/`;
    internalRoutes.set(e.wpSlug, target);
  }

  const imageJobs = new Map(); // url remota → caminho local (/imagens/wp/…)
  const stats = { paginas: 0, noticias: 0, skipped: 0 };

  for (const { item, wpSlug, slug, lang, isNews, title } of entries) {
    if (!isNews && SKIP_PAGE_SLUGS.has(wpSlug)) {
      stats.skipped++;
      continue;
    }

    const link = item.link ?? '';
    const html = cdata(item['content:encoded']) ?? '';
    const wpExcerpt = (cdata(item['excerpt:encoded']) ?? '').trim();
    const dateStr = cdata(item['wp:post_date_gmt']) || cdata(item['wp:post_date']);
    const date = dateStr ? new Date(dateStr.replace(' ', 'T') + 'Z') : new Date();

    const cleaned = preClean(html);
    let md = td.turndown(cleaned).trim();
    md = fixBrokenQuotes(md);
    md = rewriteInternalLinks(md, internalRoutes);

    const { md: mdImages, images } = rewriteImageUrls(md);
    md = mdImages;
    for (const [url, localUrl] of images) imageJobs.set(url, localUrl);

    // Páginas do Elementor abrem com o título em h2 + subtítulo curto:
    // o layout já exibe título/descrição, então movemos para o front-matter.
    let description = '';
    let image = '';
    if (!isNews) {
      ({ md, description } = stripLeadingHeading(md));
    } else {
      ({ md, image } = extractLeadingImage(md));
    }

    const fm = buildFrontMatter({
      title,
      slug,
      lang,
      wpSlug,
      date,
      description,
      excerpt: wpExcerpt || extractExcerpt(md),
      image,
      order: PAGE_ORDER[slug],
      isNews,
      originalUrl: link,
    });

    const folder = isNews ? 'noticias' : 'paginas';
    const outDir = path.join(ROOT, 'src', 'content', folder, lang);
    await fs.mkdir(outDir, { recursive: true });
    const outFile = path.join(outDir, `${slug}.mdx`);
    await fs.writeFile(outFile, fm + '\n\n' + md + '\n');
    stats[isNews ? 'noticias' : 'paginas']++;
    console.log(`  ✓ ${path.relative(ROOT, outFile)}`);
  }

  // manifest para download posterior (local ou no CI)
  const manifestPath = path.join(__dirname, 'wp-images.json');
  const manifest = Object.fromEntries([...imageJobs].sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\n> Manifest de imagens: ${path.relative(ROOT, manifestPath)} (${imageJobs.size} imagens)`);

  if (!noImages && imageJobs.size > 0) {
    console.log(`\n> Baixando ${imageJobs.size} imagens…`);
    await downloadImages(imageJobs);
  } else if (noImages) {
    console.log(`> --no-images: pulando download`);
  }

  console.log(`\n✓ Concluído: ${stats.paginas} páginas, ${stats.noticias} notícias, ${stats.skipped} ignoradas`);
}

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function cdata(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '__cdata' in v) return v.__cdata ?? '';
  if (typeof v === 'object' && '#text' in v) return v['#text'];
  return String(v);
}

function preClean(html) {
  return html
    // remove comentários do Elementor / WP
    .replace(/<!--[\s\S]*?-->/g, '')
    // cabeçalho do tema vazado no conteúdo (logo + menu de navegação)
    .replace(/<a [^>]*href="https?:\/\/nepps\.org\/?"[^>]*>\s*<img[^>]*cropped-nepps[^>]*\/?>\s*<\/a>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    // limpa shortcodes mais comuns
    .replace(/\[\/?(?:caption|gallery|embed|vc_[^\]]+)[^\]]*\]/g, '')
    // remove atributos data-*
    .replace(/\s+data-[a-z0-9_-]+="[^"]*"/gi, '')
    // tira <style>/<script> embutidos
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
}

// o export do WP corrompeu aspas curvas em `?`: ?alternativo? → “alternativo”
function fixBrokenQuotes(md) {
  return md.replace(/(^|[\s(])\?([^?\n]{2,90}?)\?(?=[\s.,;:)])/g, '$1“$2”');
}

function rewriteInternalLinks(md, internalRoutes) {
  return md.replace(/\]\((https?:\/\/(?:www\.)?nepps\.org[^)\s]*)\)/g, (m, url) => {
    const { pathname } = new URL(url);
    if (pathname.startsWith('/wp-content/')) return m; // imagens: tratadas à parte
    const slug = pathname.replace(/^\/+|\/+$/g, '');
    const target = internalRoutes.get(slug);
    return target ? `](${target})` : m;
  });
}

function rewriteImageUrls(md) {
  const images = new Map();
  const re = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  const out = md.replace(re, (m, alt, url) => {
    if (!/nepps\.org/i.test(url)) return m; // mantém externos
    const file = path.basename(new URL(url).pathname);
    const localUrl = `/imagens/wp/${file}`;
    images.set(url, localUrl);
    return `![${alt}](${localUrl})`;
  });
  return { md: out, images };
}

// Remove o h2 inicial (título repetido) e captura o subtítulo curto seguinte.
function stripLeadingHeading(md) {
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (!/^##\s+/.test(lines[i] ?? '')) return { md, description: '' };
  i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  let description = '';
  const next = lines[i]?.trim() ?? '';
  // subtítulo: parágrafo curto sem marcação
  if (next && next.length <= 120 && !/^[#\-!\[>*]|\]\(/.test(next)) {
    description = next;
    i++;
  }
  return { md: lines.slice(i).join('\n').trim(), description };
}

// Para notícias: primeira imagem vira front-matter `image` (cards/OG).
function extractLeadingImage(md) {
  const m = md.match(/^(?:\[)?!\[[^\]]*\]\(([^)\s]+)\)(?:\]\([^)\s]+\))?\s*/);
  if (!m) return { md, image: '' };
  return { md: md.slice(m[0].length).trim(), image: m[1] };
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function buildFrontMatter({ title, slug, lang, wpSlug, date, description, excerpt, image, order, isNews, originalUrl }) {
  const lines = [
    '---',
    `title: ${yamlString(title)}`,
    `slug: ${slug}`,
    `lang: ${lang}`,
    `wpSlug: ${wpSlug}`,
  ];
  if (isNews) {
    lines.push(`date: ${date.toISOString()}`);
    if (excerpt) lines.push(`excerpt: ${yamlString(excerpt)}`);
    if (image) lines.push(`image: ${yamlString(image)}`);
    lines.push('tags: []');
  } else {
    if (description) lines.push(`description: ${yamlString(description)}`);
    if (order != null) lines.push(`order: ${order}`);
    lines.push(`updated: ${date.toISOString()}`);
  }
  if (originalUrl) lines.push(`# original: ${originalUrl}`);
  lines.push('---');
  return lines.join('\n');
}

function yamlString(s) {
  const safe = String(s).replace(/"/g, '\\"');
  return `"${safe}"`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
