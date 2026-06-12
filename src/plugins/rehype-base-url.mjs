/**
 * Plugin rehype para as imagens e links do conteúdo markdown/MDX:
 *  - prefixa a `base` do Astro em URLs root-relative (`/imagens/…`, `/pt/equipe/`);
 *  - aplica lazy loading (`loading="lazy"`, `decoding="async"`);
 *  - injeta `width`/`height` lendo o arquivo em `public/` (evita layout shift).
 *
 * O conteúdo é escrito com caminhos a partir da raiz para não acoplar os
 * arquivos MDX ao deploy em subdiretório do GitHub Pages.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

const dimsCache = new Map();
function dimensions(file) {
  if (!dimsCache.has(file)) {
    dimsCache.set(
      file,
      sharp(file)
        .metadata()
        .then(({ width, height }) => (width && height ? { width, height } : null))
        .catch(() => null),
    );
  }
  return dimsCache.get(file);
}

export default function rehypeBaseUrl({ base = '/' } = {}) {
  const prefix = base.replace(/\/$/, '');

  const rewrite = (value) => {
    if (typeof value !== 'string' || !prefix) return value;
    if (!value.startsWith('/') || value.startsWith('//')) return value;
    if (value === prefix || value.startsWith(`${prefix}/`)) return value;
    return prefix + value;
  };

  return async (tree) => {
    const images = [];

    const visit = (node) => {
      if (node.type === 'element' && node.properties) {
        if (node.properties.href) node.properties.href = rewrite(node.properties.href);
        if (node.properties.src) {
          node.properties.src = rewrite(node.properties.src);
          if (node.tagName === 'img') images.push(node);
        }
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);

    await Promise.all(
      images.map(async (img) => {
        img.properties.loading ??= 'lazy';
        img.properties.decoding ??= 'async';
        if (img.properties.width || img.properties.height) return;
        const src = String(img.properties.src ?? '');
        const local = prefix && src.startsWith(`${prefix}/`) ? src.slice(prefix.length) : src;
        if (!local.startsWith('/') || local.startsWith('//')) return;
        const dims = await dimensions(path.join(PUBLIC_DIR, local));
        if (dims) {
          img.properties.width = dims.width;
          img.properties.height = dims.height;
        }
      }),
    );
  };
}
