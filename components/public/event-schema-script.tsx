import { buildEventJsonLd, type EventSeoInput } from "@/lib/seo/event-metadata"

export function EventSchemaScript(event: EventSeoInput) {
  const jsonLd = buildEventJsonLd(event)
  const serialized = JSON.stringify(jsonLd).replace(/</g, "\\u003c")

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialized }}
    />
  )
}
