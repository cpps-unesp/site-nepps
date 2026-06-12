#!/usr/bin/env node
/**
 * Auditoria de fidelidade de conteúdo: para cada entrada migrada (que guarda
 * a URL original no comentário `# original:` do front-matter), baixa a página
 * do WordPress, extrai o texto do conteúdo (entry-content) e verifica quanto
 * dele está presente no markdown migrado. Também compara o número de imagens.
 *
 * Gera docs/content-audit.md (relatório ordenado do pior para o melhor) e
 * docs/content-audit.json (dados brutos). Roda no GitHub Actions, onde há
 * acesso de rede ao WordPress.
 *
 * Uso: node scripts/audit-content.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CONCURRENCY = 6;

const DIRS = [
  'src/content/paginas/pt',
  'src/content/noticias/pt',
  'src/content/_wp-raw',
];

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

/** texto "achatado" para comparação tolerante (sem espaços/pontuação/caixa) */
function squeeze(s) {
  return decodeEntities(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function mdToText(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^---[\s\S]*?---/m, ' ')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** recorta o conteúdo principal da página original */
function extractEntryContent(html) {
  const tag = html.search(/class="[^"]*entry-content[^"]*"/);
  if (tag === -1) return '';
  const open = html.indexOf('>', tag);
  if (open === -1) return '';
  const after = html.slice(open + 1);
  const endMarkers = ['class="entry-footer', '</article>', 'id="comments"', 'class="site-footer'];
  let end = after.length;
  for (const m of endMarkers) {
    const i = after.indexOf(m);
    if (i !== -1 && i < end) end = i;
  }
  return after.slice(0, end);
}

async function auditFile(file) {
  const raw = await fs.readFile(file, 'utf8');
  const orig = /^#\s*original:\s*(\S+)/m.exec(raw)?.[1];
  const title = /^title:\s*"?(.*?)"?\s*$/m.exec(raw)?.[1] ?? path.basename(file);
  if (!orig) return { file, title, skipped: 'sem URL original' };

  let html;
  try {
    const res = await fetch(orig, { headers: { 'User-Agent': UA } });
    if (!res.ok) return { file, title, orig, skipped: `HTTP ${res.status}` };
    html = await res.text();
  } catch (e) {
    return { file, title, orig, skipped: e.message };
  }

  const content = extractEntryContent(html);
  if (!content) return { file, title, orig, skipped: 'entry-content não encontrado' };

  const origText = htmlToText(content);
  const description = /^description:\s*"?(.*?)"?\s*$/m.exec(raw)?.[1] ?? '';
  const oursSq = squeeze(mdToText(raw) + ' ' + title + ' ' + description);

  // frases do original com mais de 40 caracteres
  const chunks = origText
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 40);
  const missing = chunks.filter((c) => !oursSq.includes(squeeze(c)));

  const origImgs = (content.match(/<img\b/gi) ?? []).length;
  const ourImgs = (raw.match(/!\[/g) ?? []).length;

  return {
    file: path.relative(ROOT, file),
    title,
    orig,
    chunks: chunks.length,
    missing: missing.length,
    missingPct: chunks.length ? Math.round((missing.length / chunks.length) * 100) : 0,
    missingSamples: missing.slice(0, 3).map((c) => c.slice(0, 160)),
    origImgs,
    ourImgs,
  };
}

async function main() {
  const files = [];
  for (const dir of DIRS) {
    try {
      for (const f of await fs.readdir(path.join(ROOT, dir))) {
        if (f.endsWith('.md')) files.push(path.join(ROOT, dir, f));
      }
    } catch {}
  }
  console.log(`> Auditando ${files.length} entradas…`);

  const results = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < files.length) {
        const f = files[i++];
        const r = await auditFile(f);
        results.push(r);
        if (results.length % 25 === 0) console.log(`  …${results.length}/${files.length}`);
      }
    }),
  );

  const audited = results.filter((r) => !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  audited.sort((a, b) => b.missingPct - a.missingPct || b.missing - a.missing);

  const lines = [
    '# Auditoria de conteúdo vs nepps.org',
    '',
    `Gerado em ${new Date().toISOString()} — ${audited.length} páginas auditadas, ${skipped.length} puladas.`,
    '',
    '| % faltando | frases (faltam/total) | imgs (orig/nosso) | arquivo |',
    '|---:|---:|---:|---|',
    ...audited.map(
      (r) => `| ${r.missingPct}% | ${r.missing}/${r.chunks} | ${r.origImgs}/${r.ourImgs} | ${r.file} |`,
    ),
    '',
    '## Amostras do que falta (piores 15)',
    '',
  ];
  for (const r of audited.filter((r) => r.missing > 0).slice(0, 15)) {
    lines.push(`### ${r.file} — ${r.missingPct}% faltando`);
    for (const s of r.missingSamples) lines.push(`- “${s}…”`);
    lines.push('');
  }
  if (skipped.length) {
    lines.push('## Puladas', '');
    for (const r of skipped) lines.push(`- ${r.file}: ${r.skipped}`);
  }

  await fs.mkdir(path.join(ROOT, 'docs'), { recursive: true });
  await fs.writeFile(path.join(ROOT, 'docs/content-audit.md'), lines.join('\n') + '\n');
  await fs.writeFile(
    path.join(ROOT, 'docs/content-audit.json'),
    JSON.stringify(results, null, 2) + '\n',
  );

  const bad = audited.filter((r) => r.missingPct > 10).length;
  console.log(`\n✓ Relatório em docs/content-audit.md — ${bad} páginas com >10% de texto faltando`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
