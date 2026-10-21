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
