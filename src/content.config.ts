import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Acrescente novos idiomas aqui ao expandir o site (ver src/i18n/translations.ts).
const langField = z.enum(['pt']);

// id = caminho do arquivo (ex.: "pt/como-colaborar"). Sem isso, o glob loader
// usa o `slug` do front-matter como id, colidindo entre idiomas.
const idFromPath = ({ entry }: { entry: string }) => entry.replace(/\.(md|mdx)$/, '');

const paginas = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/paginas', generateId: idFromPath }),
  schema: z.object({
    title: z.string(),
    lang: langField,
    slug: z.string().optional(),
    wpSlug: z.string().optional(),
    description: z.string().optional(),
    order: z.number().default(99),
    hero: z.string().optional(),
    updated: z.coerce.date().optional(),
  }),
});

const noticias = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/noticias', generateId: idFromPath }),
  schema: z.object({
    title: z.string(),
    lang: langField,
    slug: z.string().optional(),
    wpSlug: z.string().optional(),
    date: z.coerce.date(),
    excerpt: z.string().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().default('NEPPS'),
    featured: z.boolean().default(false),
  }),
});

// A equipe é hoje uma página migrada do WordPress (src/content/paginas/pt/equipe.mdx).
// Se quisermos voltar aos cards estruturados (como no site-redalint), recriar aqui a
// collection `equipe` + a rota src/pages/[lang]/equipe.astro.
export const collections = { paginas, noticias };
