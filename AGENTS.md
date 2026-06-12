# AGENTS.md

Guia para desenvolvimento (humano ou agente) neste repositório.

## Snapshot

- Framework: **Astro** (`output: 'static'`) + MDX.
- Estilo: **Tailwind CSS 4** (`@tailwindcss/vite`) + **DaisyUI** (temas `nepps`/`neppsdark`).
- Conteúdo: **Astro content collections** validadas por **Zod** (`src/content.config.ts`).
- Busca: **Pagefind** (gerada no `build`).
- Idiomas: só `pt` por enquanto; i18n preparado para mais (ver README).

## Comandos

- `npm install` — dependências.
- `npm run dev` — servidor local (`/site-nepps/pt/`).
- `npm run build` — `astro build` + índice Pagefind (saída em `dist/`).
- `npm run preview` — pré-visualiza o build.
- `npm run typecheck` — `astro check` (TypeScript strict).
- `npm run convert-wp` / `npm run download-images` — migração WordPress (ver README).
- CI (PRs): `npm run typecheck` + `npm run build` (`.github/workflows/ci.yml`).

## Convenções

- Componentes `PascalCase.astro`; funções `camelCase`; rotas/slugs `kebab-case`.
- ESM apenas (`"type": "module"`). Alias de import `~/*` → `src/*`.
- Astro: lógica no frontmatter, markup limpo no template.
- TypeScript strict; preferir early returns e fallbacks para campos opcionais.
- Não traduzir conteúdo automaticamente; preservar o português.

## Collections (`src/content.config.ts`)

- `paginas`: `title`, `lang` (+ `slug`, `wpSlug`, `description`, `order`, `hero`, `updated`).
- `noticias`: `title`, `lang`, `date` (+ `slug`, `wpSlug`, `excerpt`, `image`, `tags`, `author`, `featured`).
- `equipe`: `name` (+ `lang`, `role`, `affiliation`, `photo`, `pagina`, `order`, `links`).

O `id` da entrada vem do caminho do arquivo (`pt/<slug>`); o `slug` da URL vem
de `entrySlug()` (front-matter `slug` ou nome do arquivo).

## SEO / URLs

- `BaseLayout` emite canonical, `hreflang`, OG/Twitter, JSON-LD.
- `src/pages/[wpSlug].astro` gera redirects das URLs antigas do WordPress
  (preserva links externos); alimentado pelo campo `wpSlug` das entradas.
- `sitemap.xml` e `rss.xml` são gerados em build.

## Boas práticas para agentes

- Mudanças mínimas e localizadas; seguir os padrões dos arquivos vizinhos.
- Não introduzir dependências novas sem necessidade.
- `convert-wp` **sobrescreve** `src/content/` — não rodar sobre conteúdo já curado.
- `main` publica via GitHub Actions; trabalhar em branch + PR com CI verde.
