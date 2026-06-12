#!/usr/bin/env node
/**
 * Gera os favicons a partir do "R" colorido do wordmark oficial
 * (legível em 16–32px, ao contrário do logo completo com o mapa):
 *   - public/favicon-32.png
 *   - public/apple-touch-icon.png (180×180, fundo branco)
 *
 * Uso: node scripts/generate-favicons.mjs [caminho-do-wordmark.png]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? path.join(ROOT, 'public', 'imagens', 'nepps-wordmark.png');

// o "R" ocupa o início do wordmark; recorta, apara e centraliza num quadrado
const meta = await sharp(src).metadata();
const rWidth = Math.round(meta.width * 0.14);
const letter = await sharp(src)
  .extract({ left: 0, top: 0, width: rWidth, height: meta.height })
  .trim()
  .png()
  .toBuffer();

async function square(size, background) {
  const inner = Math.round(size * 0.84);
  const resized = await sharp(letter).resize({ width: inner, height: inner, fit: 'contain', background }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: 'centre' }])
    .png();
}

await (await square(32, { r: 255, g: 255, b: 255, alpha: 0 })).toFile(path.join(ROOT, 'public', 'favicon-32.png'));
await (await square(180, { r: 255, g: 255, b: 255, alpha: 1 })).toFile(path.join(ROOT, 'public', 'apple-touch-icon.png'));
console.log('✓ public/favicon-32.png, public/apple-touch-icon.png');
