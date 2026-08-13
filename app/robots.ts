import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://tokepass.app"

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/events", "/events/", "/login", "/register"],
        disallow: [
          "/admin",
          "/admin/",
          "/organizer",
          "/organizer/",
          "/superadmin",
          "/superadmin/",
          "/super-admin",
          "/api",
          "/api/",
          "/my-tickets",
          "/mis-tickets",
          "/my-orders",
          "/profile",
          "/cuenta",
          "/cuenta/",
          "/checkout",
          "/promoter",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
