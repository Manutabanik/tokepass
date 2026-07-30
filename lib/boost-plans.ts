export type BoostTier = "silver" | "gold" | "platinum"

export type BoostPlan = {
  tier: BoostTier
  name: string
  priceArs: number
  durationDays: number
  multiplierLabel: string
  benefits: string[]
  accent: string
}

export const BOOST_PLANS: BoostPlan[] = [
  {
    tier: "silver",
    name: "Silver",
    priceArs: 15_000,
    durationDays: 7,
    multiplierLabel: "x1.5",
    benefits: [
      "Badge Destacado en la portada",
      "Prioridad sobre eventos orgánicos",
      "7 días de visibilidad premium",
    ],
    accent: "zinc",
  },
  {
    tier: "gold",
    name: "Gold",
    priceArs: 35_000,
    durationDays: 14,
    multiplierLabel: "x2",
    benefits: [
      "Todo Silver",
      "Slot en carrusel de destacados",
      "14 días + mayor peso en ranking",
    ],
    accent: "amber",
  },
  {
    tier: "platinum",
    name: "Platinum",
    priceArs: 79_000,
    durationDays: 30,
    multiplierLabel: "x3",
    benefits: [
      "Todo Gold",
      "Máxima prioridad en portada",
      "30 días de dominio visual",
    ],
    accent: "cyan",
  },
]

export function getBoostPlan(tier: string): BoostPlan | null {
  return BOOST_PLANS.find((plan) => plan.tier === tier) ?? null
}

export const BOOST_TIER_RANK: Record<BoostTier, number> = {
  platinum: 3,
  gold: 2,
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
