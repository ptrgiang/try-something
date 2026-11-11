// schema.org JSON-LD for search engines. Every page carries the WebSite and Organization nodes;
// pages add their own nodes, linked to those by @id.

export const SITE = "https://trysometh.ing";
export type LdNode = Record<string, unknown>;

const abs = (path: string) => new URL(path, SITE).toString();
const WEBSITE_ID = `${SITE}/#website`;
const ORG_ID = `${SITE}/#organization`;

const WEBSITE: LdNode = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${SITE}/`,
  name: "Try Something",
  publisher: { "@id": ORG_ID },
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE}/explore?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

const ORGANIZATION: LdNode = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Try Something",
  url: `${SITE}/`,
  logo: abs("/apple-touch-icon.png"),
};

const BRAND_SUFFIX = " - Try Something";
/** Search results cut titles near 60 characters, so the brand is dropped rather than the page's own words. */
export const TITLE_MAX = 60;

export function pageTitle(title?: string | null): string {
  if (!title) return "Try Something - Discover tools worth trying";
  return title.length + BRAND_SUFFIX.length <= TITLE_MAX ? title + BRAND_SUFFIX : title;
}

const ACRONYMS = new Set(["3d", "ai", "api", "css", "html", "json", "pdf", "svg", "ui", "ux"]);

/** Heading for a tag page no editor has titled: "open-source" becomes "Open source tools". */
export function tagHeading(tag: string): string {
  const text = tag
    .split("-")
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} tools`;
}

// Rules are prefix matches: "/me" would also block /media (tool covers), so directories end in "/".
const DISALLOW = ["/admin", "/api/", "/me/", "/login", "/submit", "/surprise", "/feedback"];

/** Only the production host is indexable; previews and workers.dev stay out of search. */
export function robotsTxt(production: boolean): string {
  if (!production) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\n${DISALLOW.map((p) => `Disallow: ${p}`).join("\n")}\nSitemap: ${SITE}/sitemap.xml\n`;
}

export function siteGraph(nodes: LdNode[] = []): LdNode {
  return { "@context": "https://schema.org", "@graph": [WEBSITE, ORGANIZATION, ...nodes] };
}

/** A list page (tag, category, collection) and the tools on it, in display order. */
export function collectionLd(page: { path: string; name: string; description?: string | null; tools: { slug: string; name: string }[] }): LdNode {
  return {
    "@type": "CollectionPage",
    "@id": `${abs(page.path)}#page`,
    url: abs(page.path),
    name: page.name,
    ...(page.description ? { description: page.description } : {}),
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.tools.length,
      itemListElement: page.tools.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/tools/${t.slug}`), name: t.name })),
    },
  };
}

/** The /collections index: a list of collection pages rather than of tools. */
export function collectionIndexLd(page: { path: string; name: string; description: string; items: { path: string; name: string }[] }): LdNode {
  return {
    "@type": "CollectionPage",
    "@id": `${abs(page.path)}#page`,
    url: abs(page.path),
    name: page.name,
    description: page.description,
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.items.length,
      itemListElement: page.items.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: abs(c.path), name: c.name })),
    },
  };
}

/** The listing page itself, with its dates; `about` points at the page's WebApplication node. */
export function toolPageLd(page: { path: string; name: string; description: string; published: string; modified: string; about: string }): LdNode {
  return {
    "@type": "WebPage",
    "@id": `${abs(page.path)}#page`,
    url: abs(page.path),
    name: page.name,
    description: page.description,
    isPartOf: { "@id": WEBSITE_ID },
    datePublished: page.published,
    dateModified: page.modified,
    mainEntity: { "@id": page.about },
  };
}

/** Breadcrumbs below Home, e.g. Explore › Design › Excalidraw. */
export function crumbsLd(items: { name: string; path: string }[]): LdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...items].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })),
  };
}

export function profileLd(p: { path: string; name: string; handle: string; description?: string | null; image?: string | null }): LdNode {
  return {
    "@type": "ProfilePage",
    "@id": `${abs(p.path)}#page`,
    url: abs(p.path),
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "Person",
      name: p.name,
      alternateName: `@${p.handle}`,
      url: abs(p.path),
      ...(p.description ? { description: p.description } : {}),
      ...(p.image ? { image: abs(p.image) } : {}),
    },
  };
}

/** Serialized for a <script type="application/ld+json">; "<" is escaped so text can't close the tag. */
export const ldJson = (graph: LdNode) => JSON.stringify(graph).replace(/</g, "\u003c");
