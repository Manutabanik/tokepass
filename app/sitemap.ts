import type { MetadataRoute } from "next"

import { PUBLIC_CATALOG_VISIBILITY } from "@/lib/catalog/public-visibility"
import { createPublicClient } from "@/lib/supabase/public"
import { getSeoOrigin, publicEventPath } from "@/lib/seo/site"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSeoOrigin()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/terminos-y-condiciones`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/politica-de-privacidad`,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${siteUrl}/arrepentimiento`,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ]

  try {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from("events")
      .select("id, slug, updated_at, date")
      .eq("status", "published")
      .eq("visibility", PUBLIC_CATALOG_VISIBILITY)
      .order("date", { ascending: true })
      .limit(5000)

    const eventRoutes: MetadataRoute.Sitemap = (data ?? [])
      .filter((event) => Boolean(event.slug?.trim() || event.id))
      .map((event) => ({
        url: `${siteUrl}${publicEventPath(event)}`,
        lastModified: event.updated_at
          ? new Date(event.updated_at)
          : new Date(event.date),
        changeFrequency: "daily",
        priority: 0.9,
      }))

    return [...staticRoutes, ...eventRoutes]
  } catch {
    return staticRoutes
  }
}
