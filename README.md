# site-nepps

Site do **NEPPS** — Núcleo de Estudos e Pesquisas em Política Social (UNESP/Franca).

Site estático em **Astro**, hospedado no **GitHub Pages**, preparado para receber
o conteúdo migrado do WordPress de [nepps.org](https://nepps.org/).

> Estrutura e boas práticas inspiradas em
> [cpps-unesp/site-cpps](https://github.com/cpps-unesp/site-cpps) e
> [colabhd/site-redalint](https://github.com/colabhd/site-redalint) (do qual este
> repositório herda o pipeline de migração WordPress → Astro).

## Stack

- [Astro](https://astro.build) (`output: 'static'`) + MDX
- TypeScript em modo `strict`
- [Tailwind CSS 4](https://tailwindcss.com) via `@tailwindcss/vite` + [DaisyUI](https://daisyui.com)
- [Pagefind](https://pagefind.app) (busca estática no cliente)
- `theme-change` + `data-theme` para dark/light sem FOUC
- RSS via `@astrojs/rss`, `sitemap.xml` e `hreflang`/canonical no `BaseLayout`

## Estrutura

```
src/
  content/
    paginas/pt/<slug>.mdx     # páginas institucionais
    noticias/pt/<slug>.mdx    # notícias
    equipe/pt/<membro>.mdx    # perfis da equipe (cards em /pt/equipe/)
  layouts/BaseLayout.astro    # SEO, hreflang, canonical, OG, tema
  components/                 # Header, Footer, NoticiaCard, ThemeToggle…
  pages/
    index.astro               # redirect → /pt/
    [wpSlug].astro            # stubs de redirect das URLs antigas do WP
    [lang]/
      index.astro             # home
      [...slug].astro         # páginas
      equipe.astro            # cards da equipe
      noticias/{index,[slug]}.astro
      busca.astro             # Pagefind UI
    sitemap.xml.ts, rss.xml.ts, 404.astro
  i18n/translations.ts        # textos de UI + idiomas suportados
  content.config.ts           # schemas Zod das collections
  plugins/rehype-base-url.mjs # prefixa a base nos links/imagens do markdown
  styles/global.css           # temas DaisyUI (nepps / neppsdark) + fontes
  utils/paths.ts, utils/content.ts
scripts/
  wp-to-mdx.mjs               # conversor WXR (WordPress) → MDX
  download-wp-images.mjs       # baixa imagens do manifest scripts/wp-images.json
  generate-og.mjs, generate-favicons.mjs
public/
  favicon-32.png, apple-touch-icon.png, og-default.png, robots.txt
```

## Comandos

```bash
npm install
npm run dev          # http://localhost:4321/site-nepps/pt/
npm run build        # gera ./dist com índice Pagefind
npm run preview
npm run typecheck
npm run convert-wp        # roda scripts/wp-to-mdx.mjs (gera src/content/* + baixa imagens)
npm run download-images   # baixa as imagens do manifest scripts/wp-images.json
```

## Migração de conteúdo (nepps.org)

O conteúdo placeholder atual em `src/content/` existe só para o site compilar.
Para trazer o conteúdo real:

1. No WordPress de nepps.org, **Ferramentas → Exportar** → baixe o XML (WXR) e
   salve na raiz como `nepps.WordPress.xml`.
2. `npm run convert-wp` — o conversor (`scripts/wp-to-mdx.mjs`):
   - lê o WXR, filtra `page`/`post` publicados;
   - limpa shortcodes/Elementor, corrige aspas do export;
   - converte HTML → Markdown (Turndown), preservando figuras com legenda;
   - reescreve links internos `nepps.org/<slug>` → `/pt/<slug>/`;
   - baixa imagens de `wp-content` para `public/imagens/wp/` e gera o manifest
     `scripts/wp-images.json`;
   - grava MDX validado pelos schemas Zod, com `wpSlug` (slug antigo, usado nos
     redirects de `src/pages/[wpSlug].astro`).
3. Revise/cure o MDX gerado. **`convert-wp` sobrescreve a curadoria manual** —
   após a primeira conversão, o conteúdo versionado é a fonte de verdade.

Ajuste, antes de rodar, `slugRemap`/`PAGE_ORDER`/`SKIP_PAGE_SLUGS` em
`scripts/wp-to-mdx.mjs` conforme as páginas reais do nepps.org.

## Deploy

GitHub Pages a partir de `main` via `.github/workflows/deploy.yml`. Em
**Settings → Pages**, selecionar **Source: GitHub Actions**. URL:
`https://cpps-unesp.github.io/site-nepps/`.

Para um domínio próprio: criar `public/CNAME`, ajustar `site`/`base` em
`astro.config.mjs` e apontar o DNS para o GitHub Pages.

## Idiomas

O site nasce só em **português**. A maquinaria de i18n (rotas `[lang]`, `t()`,
`localizedPath`, `hreflang`) já está pronta: para adicionar um idioma, inclua-o
em `LANGUAGES`/`LOCALE_MAP`/dicionário (`src/i18n/translations.ts`) e em
`langField` (`src/content.config.ts`), e traduza o conteúdo em `src/content/`.

## Pendências de branding

- Trocar o wordmark de texto "NEPPS" (Header/Footer) pela logo oficial.
- Adicionar `public/og-default.png`, `public/favicon-32.png` e
  `public/apple-touch-icon.png` (referenciados no `BaseLayout`; ver
  `scripts/generate-og.mjs` e `scripts/generate-favicons.mjs`).
- Ajustar as cores dos temas `nepps`/`neppsdark` em `src/styles/global.css`.
- Confirmar nome completo e descrição do núcleo em `src/i18n/translations.ts`.
