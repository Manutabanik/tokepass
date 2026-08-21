export type LegacyBoostTier = "silver" | "gold" | "platinum"
export type BoostTier = "flash_3d" | "pro_7d" | "vip_total"
export type AnyBoostTier = BoostTier | LegacyBoostTier

export type BoostPlan = {
  tier: AnyBoostTier
  name: string
  priceArs: number
  durationDays: number
  multiplierLabel: string
  benefits: string[]
  accent: string
  popular?: boolean
}

export const BOOST_PLANS: BoostPlan[] = [
  {
    tier: "flash_3d",
    name: "Flash",
    priceArs: 15_000,
    durationDays: 3,
    multiplierLabel: "3 días",
    benefits: [
      "Posición prioritaria en categorías",
      "Badge de impulso en listados",
      "3 dias de visibilidad destacada",
    ],
    accent: "cyan",
  },
  {
    tier: "pro_7d",
    name: "PRO",
    priceArs: 35_000,
    durationDays: 7,
    multiplierLabel: "7 días",
    popular: true,
    benefits: [
      "Posición #1 en Home",
      "Badge neón en listados",
      "7 dias de cobertura",
    ],
    accent: "violet",
  },
  {
    tier: "vip_total",
    name: "VIP",
    priceArs: 79_000,
    durationDays: 14,
    multiplierLabel: "14 días",
    benefits: [
      "Banner principal en Home",
      "Notificación en el resumen semanal",
      "14 dias de cobertura total",
    ],
    accent: "amber",
  },
]

const LEGACY_BOOST_PLANS: BoostPlan[] = [
  {
    tier: "silver",
    name: "Silver",
    priceArs: 15_000,
    durationDays: 7,
    multiplierLabel: "x1.5",
    benefits: ["Plan legado Silver"],
    accent: "zinc",
  },
  {
    tier: "gold",
    name: "Gold",
    priceArs: 35_000,
    durationDays: 14,
    multiplierLabel: "x2",
    benefits: ["Plan legado Gold"],
    accent: "amber",
  },
  {
    tier: "platinum",
    name: "Platinum",
    priceArs: 79_000,
    durationDays: 30,
    multiplierLabel: "x3",
    benefits: ["Plan legado Platinum"],
    accent: "cyan",
  },
]

export function getBoostPlan(tier: string): BoostPlan | null {
  return (
    BOOST_PLANS.find((plan) => plan.tier === tier) ??
    LEGACY_BOOST_PLANS.find((plan) => plan.tier === tier) ??
    null
  )
}

export const BOOST_TIER_RANK: Record<AnyBoostTier, number> = {
  vip_total: 3,
  platinum: 3,
  pro_7d: 2,
  gold: 2,
  flash_3d: 1,
  silver: 1,
}

export function boostExternalRef(subscriptionId: string): string {
  return `boost:${subscriptionId}`
}

export function parseBoostExternalRef(
  externalReference: string | null | undefined,
): string | null {
  if (!externalReference?.startsWith("boost:")) return null
  const id = externalReference.slice("boost:".length).trim()
  return id || null
}

export function isFeaturedBoostActive(input: {
  isFeatured?: boolean | null
  featuredUntil?: string | null
  now?: number
}): boolean {
  if (!input.isFeatured || !input.featuredUntil) return false
  return new Date(input.featuredUntil).getTime() > (input.now ?? Date.now())
}

export function formatBoostRemaining(
  until: string,
  now = Date.now(),
): string {
  const ms = new Date(until).getTime() - now
  if (!Number.isFinite(ms) || ms <= 0) return "Finalizado"
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}
