import { buildWebsiteJsonLd } from "@/lib/seo/website-jsonld"

export function WebsiteSchemaScript() {
  const serialized = JSON.stringify(buildWebsiteJsonLd()).replace(/</g, "\\u003c")

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  )
}
