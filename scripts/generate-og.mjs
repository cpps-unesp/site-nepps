#!/usr/bin/env node
/**
 * Gera `public/og-default.png` (1200×630), a imagem Open Graph padrão
 * usada pelo BaseLayout quando a página não define imagem própria.
 * Usa o logo oficial (public/imagens/nepps-logo-completo.svg) sobre
 * fundo branco, com faixa inferior nas cores da marca.
 *
 * Uso: node scripts/generate-og.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(ROOT, 'public', 'imagens', 'nepps-logo-completo.svg');

// SVG oficial tem viewBox 65×46; density alta para rasterizar nítido
const logo = await sharp(LOGO, { density: 800 }).resize({ width: 680 }).png().toBuffer();
const { width: lw, height: lh } = await sharp(logo).metadata();

// faixa inferior com o degradê da marca (cores extraídas do logo)
const strip = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="36">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#F0C83B"/>
      <stop offset="0.25" stop-color="#F1563C"/>
      <stop offset="0.5" stop-color="#C34B9B"/>
      <stop offset="0.78" stop-color="#00B3C1"/>
      <stop offset="1" stop-color="#00B36C"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="36" fill="url(#g)"/>
</svg>`);

const url = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="40">
  <text x="600" y="28" text-anchor="middle" font-family="'DejaVu Sans', Helvetica, sans-serif" font-size="26" fill="#808285">nepps.org</text>
</svg>`);

const out = path.join(ROOT, 'public', 'og-default.png');
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#ffffff' } })
  .composite([
    { input: logo, left: Math.round((1200 - lw) / 2), top: Math.round((594 - lh) / 2) - 20 },
    { input: url, left: 0, top: 530 },
    { input: strip, left: 0, top: 594 },
  ])
  .png()
  .toFile(out);
console.log(`✓ ${path.relative(ROOT, out)}`);
