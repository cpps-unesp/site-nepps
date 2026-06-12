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
    title: 'NEPPS — Notícias',
    description:
      'Rede de Pesquisadores e Gestores em Internacionalização da Educação Superior da América Latina',
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
