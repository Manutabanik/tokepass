import { publicEventPath } from "@/lib/seo/site"
import { normalizeReferralCode } from "@/lib/referral"

export type PromoterCommissionType = "percent" | "fixed"

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function computePromoterCommission(input: {
  type: PromoterCommissionType | string | null | undefined
  rate: number
  fixedAmount: number
  subtotal: number
  ticketCount: number
}): number {
  if (input.type === "fixed") {
    const qty = Math.max(1, Math.floor(Math.max(0, input.ticketCount)))
    return roundMoney(Math.max(0, input.fixedAmount) * qty)
  }
  const rate = Math.min(1, Math.max(0, input.rate))
  return roundMoney(Math.max(0, input.subtotal) * rate)
}

export const RRPP_QUERY_KEYS = ["rrpp", "ref"] as const

export function extractAffiliateCode(
  searchParams: URLSearchParams | { get(name: string): string | null },
): string | null {
  for (const key of RRPP_QUERY_KEYS) {
    const code = normalizeReferralCode(searchParams.get(key))
    if (code) return code
  }
  return null
}

export function buildRrppSharePath(input: {
  slug?: string | null
  id: string
  referralCode: string
}): string | null {
  const code = normalizeReferralCode(input.referralCode)
  if (!code) return null
  const slug = input.slug?.trim() || input.id
  return `/e/${encodeURIComponent(slug)}?rrpp=${encodeURIComponent(code)}`
}

export function buildRrppShareUrl(input: {
  origin: string
  slug?: string | null
  id: string
  referralCode: string
}): string {
  const path = buildRrppSharePath(input)
  if (!path) return input.origin
  return `${input.origin.replace(/\/$/, "")}${path}`
}

export function publicEventPathWithRrpp(input: {
  slug?: string | null
  id: string
  referralCode?: string | null
}): string {
  const path = publicEventPath(input)
  const code = normalizeReferralCode(input.referralCode)
  if (!code) return path
  return `${path}?rrpp=${encodeURIComponent(code)}`
}
