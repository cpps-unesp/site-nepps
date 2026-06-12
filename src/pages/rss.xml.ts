import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { localizedPath } from '~/utils/paths';
import { entrySlug } from '~/utils/content';

export const GET: APIRoute = async (context) => {
  const noticias = (await getCollection('noticias')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  return rss({
    title: 'NEPPs — Notícias',
    description:
      'Notícias do NEPPs — Núcleo de Estudos de Políticas Públicas “Elza de Andrade Oliveira” (FCHS, UNESP Franca)',
    site: context.site!,
    items: noticias.map((n) => ({
      title: n.data.title,
      pubDate: n.data.date,
      description: n.data.excerpt ?? '',
      link: localizedPath(n.data.lang, `noticias/${entrySlug(n)}`),
      categories: n.data.tags,
    })),
  });
};
