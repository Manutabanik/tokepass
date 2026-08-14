import type { MetadataRoute } from "next"

import { createClient } from "@/lib/supabase/server"
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
      url: `${siteUrl}/eventos`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
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
    const supabase = await createClient()
    const { data } = await supabase
      .from("events")
      .select("id, slug, updated_at, date")
      .eq("status", "published")
      .order("date", { ascending: true })
      .limit(5000)

    const eventRoutes: MetadataRoute.Sitemap = (data ?? []).map((event) => ({
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
