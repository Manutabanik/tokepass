import type { MetadataRoute } from "next"

import { createClient } from "@/lib/supabase/server"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tokepass.app"

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/events`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/login`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/register`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ]

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("events")
      .select("id, updated_at, date")
      .eq("status", "published")
      .order("date", { ascending: true })
      .limit(500)

    const eventRoutes: MetadataRoute.Sitemap = (data ?? []).map((event) => ({
      url: `${siteUrl}/events/${event.id}`,
      lastModified: event.updated_at
        ? new Date(event.updated_at)
        : new Date(event.date),
      changeFrequency: "daily",
      priority: 0.8,
    }))

    return [...staticRoutes, ...eventRoutes]
  } catch {
    return staticRoutes
  }
}
