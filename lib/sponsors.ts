export const MAX_SPONSOR_LOGO_BYTES = 2 * 1024 * 1024
export const MAX_EVENT_SPONSORS = 12
export const SPONSOR_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
])

export type SponsorTier = "main" | "regular"

export type PublicSponsor = {
  id: string
  name: string
  logoUrl: string
  websiteUrl: string | null
  tier?: SponsorTier
}

export function normalizeSponsorWebsite(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? ""
  if (!value) return null
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.toString()
  } catch {
    return null
  }
}

export function mapSponsorRow(row: {
  id: string
  name: string
  logo_url: string
  website_url: string | null
  tier?: string | null
}): PublicSponsor {
  const tier = row.tier === "main" ? "main" : row.tier === "regular" ? "regular" : undefined
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    tier,
  }
}

export function storagePathFromSponsorUrl(imageUrl: string): string | null {
  const marker = "/object/public/sponsors/"
  const idx = imageUrl.indexOf(marker)
  if (idx === -1) return null
  const path = imageUrl.slice(idx + marker.length).split("?")[0] ?? ""
  return path ? decodeURIComponent(path) : null
}
