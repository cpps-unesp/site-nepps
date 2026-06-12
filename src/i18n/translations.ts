// Idiomas suportados. O site nasce só em português; a maquinaria de i18n
// (rotas [lang], `t()`, `localizedPath`) já está pronta — para adicionar um
// idioma basta incluí-lo aqui, em LOCALE_MAP, no dicionário abaixo e no
// `langField` de src/content.config.ts, e traduzir o conteúdo em src/content/.
export const LANGUAGES = ['pt'] as const;
export type Lang = (typeof LANGUAGES)[number];
export const DEFAULT_LANG: Lang = 'pt';

export const LOCALE_MAP: Record<Lang, string> = {
  pt: 'pt-BR',
};

type Dict = Record<string, string>;

// TODO(nepps): confirmar nome completo e descrição do núcleo a partir do
// conteúdo migrado de nepps.org.
const pt: Dict = {
  'site.title': 'NEPPS',
  'site.tagline': 'Núcleo de Estudos e Pesquisas em Política Social — UNESP/Franca',
  'nav.home': 'Início',
  'nav.institucional': 'Institucional',
  'nav.noticias': 'Notícias',
  'nav.publicacoes': 'Publicações',
  'nav.pesquisas': 'Pesquisas',
  'nav.equipe': 'Equipe',
  'nav.search': 'Buscar',
  'nav.toggle_theme': 'Alternar tema',
  'nav.language': 'Idioma',
  'a11y.skip': 'Ir para o conteúdo',
  'a11y.nav_main': 'Navegação principal',
  'a11y.nav_footer': 'Navegação do rodapé',
  'footer.nav': 'Navegação',
  'footer.rights': 'Todos os direitos reservados.',
  'footer.source': 'Código-fonte no GitHub',
  'common.back': 'Voltar',
  'common.know_more': 'Saiba mais',
  'common.edit_github': 'Editar esta página no GitHub',
  'home.welcome': 'Boas-vindas!',
  'home.about_title': 'O NEPPS',
  'home.about_body':
    'Texto institucional do NEPPS. Substitua por uma apresentação do núcleo — linha de pesquisa, vínculo institucional e objetivos — a partir do conteúdo migrado de nepps.org.',
  'home.cta_institucional': 'Conhecer o núcleo',
  'home.research_title': 'Projetos & Pesquisas',
  'home.research_body': 'Conheça os projetos e pesquisas desenvolvidos pelo NEPPS.',
  'home.cta_pesquisas': 'Ver pesquisas',
  'home.publications_title': 'Publicações',
  'home.publications_body': 'Conheça a produção científica realizada pelos membros do NEPPS.',
  'home.cta_publicacoes': 'Ver publicações',
  'home.news_title': 'Notícias & Eventos',
  'home.news_body': 'Fique por dentro das nossas últimas notícias e eventos.',
  'home.news_more': 'Mais notícias',
  'home.team_title': 'Nossa Equipe',
  'home.team_body': 'Conheça os membros do NEPPS.',
  'home.cta_equipe': 'Conhecer a equipe',
  'news.title': 'Notícias',
  'news.read_more': 'Ler mais',
  'news.published_on': 'Publicado em',
  'news.empty': 'Ainda não há notícias publicadas.',
  'team.site': 'Página pessoal',
  'team.profile': 'Ver perfil completo',
};

const DICTS: Record<Lang, Dict> = { pt };

export function t(lang: Lang, key: string): string {
  return DICTS[lang]?.[key] ?? DICTS[DEFAULT_LANG][key] ?? key;
}

export function isLang(value: string): value is Lang {
  return (LANGUAGES as readonly string[]).includes(value);
}
