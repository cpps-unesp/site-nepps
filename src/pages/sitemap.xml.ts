import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { LANGUAGES } from '~/i18n/translations';
import { localizedPath } from '~/utils/paths';
import { entrySlug } from '~/utils/content';

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('astro.config.mjs `site` must be set');
  const urls = new Set<string>();

  for (const lang of LANGUAGES) {
    urls.add(new URL(localizedPath(lang, ''), site).toString());
    urls.add(new URL(localizedPath(lang, 'noticias'), site).toString());
    urls.add(new URL(localizedPath(lang, 'busca'), site).toString());
  }

  const paginas = await getCollection('paginas');
  for (const p of paginas) {
    const slug = entrySlug(p);
    urls.add(new URL(localizedPath(p.data.lang, slug), site).toString());
  }

  const noticias = await getCollection('noticias');
  for (const n of noticias) {
    const slug = entrySlug(n);
    urls.add(new URL(localizedPath(n.data.lang, `noticias/${slug}`), site).toString());
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...urls]
      .sort()
      .map((u) => `  <url><loc>${u}</loc></url>`)
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
