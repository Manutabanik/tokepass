import { formatCurrency } from "@/lib/format"
import { fallbackFeePercentagePoints } from "@/lib/pricing/event-fees"
import { calculateTierPricing } from "@/lib/pricing/flexible-pricing"

function asBasePrice(value: unknown): number {
  if (value === "" || value == null) return 0
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const ORGANIZER_BASE_PRICE_LABEL = "Precio Base (Tu ganancia)"

export type OrganizerPublicPricePreview = {
  publicPrice: number
  feePercentage: number
  absorbFees: boolean
  sponsored: boolean
}

export function organizerPublicPriceFromBase(input: {
  basePrice: unknown
  absorbFees: boolean
  platformFeePercentage?: number | null
  platformFixedFee: number
  isSponsoredByTokePass: boolean
}): OrganizerPublicPricePreview | null {
  const raw = asBasePrice(input.basePrice)
  if (!Number.isFinite(raw) || raw <= 0) return null
  const feePercentage = fallbackFeePercentagePoints(input.platformFeePercentage)

  const priced = calculateTierPricing({
    inputValue: raw,
    feePercentage,
    fixedFee: input.platformFixedFee,
    feeStrategy: input.absorbFees ? "absorb_in_price" : "pass_to_customer",
    calculationMode: input.absorbFees ? "public_price" : "net_income",
    sponsored: input.isSponsoredByTokePass,
  })

  return {
    publicPrice: priced.publicPrice,
    feePercentage: input.isSponsoredByTokePass ? 0 : feePercentage,
    absorbFees: input.absorbFees,
    sponsored: input.isSponsoredByTokePass,
  }
}

export function formatServiceFeePercent(points: number): string {
  if (!Number.isFinite(points) || points <= 0) return "0%"
  const rounded = Math.round(points * 100) / 100
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(
        rounded,
      )
  return `${text}%`
}

export function organizerPublicPriceHintParts(
  preview: OrganizerPublicPricePreview,
): {
  prefix: string
  publicPrice: string
  suffix: string
} {
  const publicPrice = formatCurrency(preview.publicPrice)
  if (preview.sponsored || preview.feePercentage <= 0) {
    return {
      prefix: "Precio final al público:",
      publicPrice,
      suffix: "(Sin cargo por servicio)",
    }
  }
  if (preview.absorbFees) {
    return {
      prefix: "Precio final al público:",
      publicPrice,
      suffix: `(El ${formatServiceFeePercent(preview.feePercentage)} de cargo por servicio se descuenta de tu ganancia)`,
    }
  }
  return {
    prefix: "Precio final al público:",
    publicPrice,
    suffix: `(Incluye ${formatServiceFeePercent(preview.feePercentage)} de cargo por servicio)`,
  }
}
