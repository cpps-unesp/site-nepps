import type { Lang } from '~/i18n/translations';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function withBase(path: string): string {
  if (!path) return BASE + '/';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const ensured = normalized.endsWith('/') || /\.[a-z0-9]+$/i.test(normalized)
    ? normalized
    : `${normalized}/`;
  return `${BASE}${ensured}`;
}

/** Prefixa a base em caminhos root-relative de assets; deixa URLs externas intactas. */
export function assetPath(src: string): string {
  if (!src || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(src)) return src;
  if (src.startsWith(`${BASE}/`)) return src;
  return withBase(src);
}

export function localizedPath(lang: Lang, path = ''): string {
  const clean = path.replace(/^\/+/, '');
  return withBase(`/${lang}/${clean}`);
}
