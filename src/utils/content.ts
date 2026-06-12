/** Slug de uma entrada de conteúdo: front-matter `slug` ou o nome do arquivo (id sem o diretório de idioma). */
export function entrySlug(entry: { id: string; data: { slug?: string } }): string {
  return entry.data.slug ?? entry.id.split('/').pop()!;
}
