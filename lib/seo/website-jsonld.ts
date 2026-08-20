import { getSeoOrigin } from "@/lib/seo/site"

export function buildWebsiteJsonLd(): Record<string, unknown> {
  const origin = getSeoOrigin()
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TokePass",
    url: origin,
    inLanguage: "es-AR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  }
}
