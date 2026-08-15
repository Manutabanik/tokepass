import type { MetadataRoute } from "next"

import { getSeoOrigin } from "@/lib/seo/site"

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSeoOrigin()

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/buscar", "/eventos", "/eventos/", "/events", "/events/"],
        disallow: [
          "/admin/",
          "/cuenta/",
          "/api/",
          "/organizer/",
          "/superadmin/",
          "/super-admin/",
          "/promoter/",
          "/checkout/",
          "/entrada/",
          "/events/preview/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
