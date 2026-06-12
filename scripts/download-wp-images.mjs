#!/usr/bin/env node
/**
 * Baixa as imagens do WordPress listadas em `scripts/wp-images.json`
 * (gerado por wp-to-mdx.mjs) para `public/imagens/wp/`.
 *
 * Idempotente: pula arquivos que já existem. Falhas individuais não
 * derrubam o processo (o build segue sem a imagem), mas são reportadas.
 *
 * Uso:
 *   node scripts/download-wp-images.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// alguns servidores WP bloqueiam user-agents não-navegador
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function downloadImages(jobs) {
  const dest = path.join(ROOT, 'public', 'imagens', 'wp');
  await fs.mkdir(dest, { recursive: true });
  let ok = 0;
  let skipped = 0;
  let fail = 0;
  await Promise.all(
    [...jobs].map(async ([url, localUrl]) => {
      const out = path.join(ROOT, 'public', localUrl);
      try {
        await fs.access(out);
        skipped++;
        return; // já existe
      } catch {}
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(out, buf);
        ok++;
      } catch (err) {
        fail++;
        console.warn(`  ! falhou ${url}: ${err.message}`);
      }
    }),
  );
  console.log(`  ${ok} baixadas, ${skipped} já existiam, ${fail} falhas`);
  return { ok, skipped, fail };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const manifestPath = path.join(__dirname, 'wp-images.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const jobs = Object.entries(manifest);
  console.log(`> Baixando ${jobs.length} imagens de ${path.relative(ROOT, manifestPath)}…`);
  const { fail } = await downloadImages(jobs);
  if (fail > 0) {
    console.warn(`\n! ${fail} imagens não puderam ser baixadas — o build segue sem elas.`);
  }
}
