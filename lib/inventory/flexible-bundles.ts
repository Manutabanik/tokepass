export const BUNDLE_TYPES = [
  "multi_day_pass",
  "cross_sell_pack",
  "volume_discount",
] as const

export type BundleType = (typeof BUNDLE_TYPES)[number]

export const BUNDLE_TYPE_LABELS: Record<BundleType, string> = {
  multi_day_pass: "Abono de varios días",
  cross_sell_pack: "Pack entradas + extras",
  volume_discount: "Descuento por volumen",
}

export const BUNDLE_TYPE_HINTS: Record<BundleType, string> = {
  multi_day_pass:
    "Un pase para todas las jornadas. Ideal para festivales de 2 o 3 días.",
  cross_sell_pack:
    "Combiná entradas o mesas con estacionamiento, consumición u otros extras.",
  volume_discount:
    "Pack de cantidad: 2x1, 4x3 o N mesas al precio promocional.",
}

export type BundleComponent = {
  tierId: string
  quantity: number
}

export type BundleDraft = {
  name: string
  bundleType: BundleType
  price: number
  originalPrice: number
  capacity: number
  items: BundleComponent[]
  includesSeating: boolean
}

export function parseBundleType(raw: unknown): BundleType | null {
  const value = String(raw ?? "").trim()
  if ((BUNDLE_TYPES as readonly string[]).includes(value)) {
    return value as BundleType
  }
  return null
}

export function inferBundleType(input: {
  bundleType?: string | null
  dayId?: string | null
  isMultiDay?: boolean
  items?: BundleComponent[]
  componentTierTypes?: Record<string, string>
}): BundleType {
  const parsed = parseBundleType(input.bundleType)
  if (parsed) return parsed

  const items = input.items ?? []
  const types = items.map(
    (item) => input.componentTierTypes?.[item.tierId] ?? "general",
  )
  const hasAddon = types.includes("addon")
  const hasSeated = types.includes("seated")
  const uniqueTiers = new Set(items.map((item) => item.tierId))
  const volumeLike =
    uniqueTiers.size === 1 && (items[0]?.quantity ?? 0) > 1

  if (input.isMultiDay && !input.dayId) return "multi_day_pass"
  if (volumeLike && !hasAddon) return "volume_discount"
  if (hasAddon || hasSeated) return "cross_sell_pack"
  return "cross_sell_pack"
}

export const PROMO_DISCOUNT_TYPES = [
  "PORCENTAJE",
  "MONTO_FIJO",
  "X_POR_Y",
] as const

export type PromoDiscountType = (typeof PROMO_DISCOUNT_TYPES)[number]

export const PROMO_DISCOUNT_LABELS: Record<PromoDiscountType, string> = {
  PORCENTAJE: "Porcentaje de descuento",
  MONTO_FIJO: "Monto fijo de descuento",
  X_POR_Y: "Llevá X, pagá Y",
}

export type PromoRule = {
  tipoDescuento: PromoDiscountType
  valorDescuento: number
  cantidadRequerida: number
  cantidadPaga: number
}

export const PROMO_TEMPLATE_2X1: PromoRule = {
  tipoDescuento: "X_POR_Y",
  valorDescuento: 0,
  cantidadRequerida: 2,
  cantidadPaga: 1,
}

export const PROMO_TEMPLATE_SECOND_HALF: PromoRule = {
  tipoDescuento: "PORCENTAJE",
  valorDescuento: 50,
  cantidadRequerida: 2,
  cantidadPaga: 2,
}

export const PROMO_TEMPLATE_4X3: PromoRule = {
  tipoDescuento: "X_POR_Y",
  valorDescuento: 0,
  cantidadRequerida: 4,
  cantidadPaga: 3,
}

export type BundleStockSource = "linked" | "own"

export function defaultPromoRule(): PromoRule {
  return {
    tipoDescuento: "PORCENTAJE",
    valorDescuento: 0,
    cantidadRequerida: 1,
    cantidadPaga: 1,
  }
}

export function parsePromoDiscountType(raw: unknown): PromoDiscountType | null {
  const value = String(raw ?? "").trim().toUpperCase()
  if ((PROMO_DISCOUNT_TYPES as readonly string[]).includes(value)) {
    return value as PromoDiscountType
  }
  return null
}

export function normalizePromoRule(
  raw?: {
    tipoDescuento?: PromoDiscountType | null
    valorDescuento?: number | null
    cantidadRequerida?: number | null
    cantidadPaga?: number | null
  } | null,
): PromoRule {
  const parsed = parsePromoDiscountType(raw?.tipoDescuento)
  const tipo = parsed ?? "PORCENTAJE"
  const required = Math.max(1, Math.floor(Number(raw?.cantidadRequerida) || 1))
  const pay = Math.max(0, Math.floor(Number(raw?.cantidadPaga) || 0))
  return {
    tipoDescuento: tipo,
    valorDescuento: Math.max(0, Number(raw?.valorDescuento) || 0),
    cantidadRequerida: Math.min(50, required),
    cantidadPaga: Math.min(50, tipo === "X_POR_Y" ? Math.min(pay, required) : pay),
  }
}

function money(value: number): number {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100)
}

export function regularBundlePrice(
  items: BundleComponent[],
  unitPriceByTierId: Record<string, number>,
): number {
  return money(
    items.reduce((sum, item) => {
      const unit = Number(unitPriceByTierId[item.tierId] ?? 0)
      return sum + unit * Math.max(0, item.quantity)
    }, 0),
  )
}

export function promotionalBundlePrice(input: {
  items: BundleComponent[]
  unitPriceByTierId: Record<string, number>
  rule: PromoRule
}): number {
  const rule = normalizePromoRule(input.rule)
  const regular = regularBundlePrice(input.items, input.unitPriceByTierId)

  if (rule.tipoDescuento === "MONTO_FIJO") {
    return money(regular - rule.valorDescuento)
  }

  if (rule.tipoDescuento === "X_POR_Y") {
    const buy = rule.cantidadRequerida
    const pay = Math.min(rule.cantidadPaga, buy)
    return money(
      input.items.reduce((sum, item) => {
        const unit = Number(input.unitPriceByTierId[item.tierId] ?? 0)
        const qty = Math.max(0, Math.floor(item.quantity) || 0)
        const groups = Math.floor(qty / buy)
        const remainder = qty % buy
        return sum + unit * (groups * pay + remainder)
      }, 0),
    )
  }

  const percent = Math.min(100, rule.valorDescuento)
  const nth = rule.cantidadRequerida
  if (nth <= 1) {
    return money(regular * (1 - percent / 100))
  }

  return money(
    input.items.reduce((sum, item) => {
      const unit = Number(input.unitPriceByTierId[item.tierId] ?? 0)
      const qty = Math.max(0, Math.floor(item.quantity) || 0)
      let line = 0
      for (let index = 1; index <= qty; index += 1) {
        line += index % nth === 0 ? unit * (1 - percent / 100) : unit
      }
      return sum + line
    }, 0),
  )
}

export function inferPromoRule(input: {
  rule?: {
    tipoDescuento?: PromoDiscountType | null
    valorDescuento?: number | null
    cantidadRequerida?: number | null
    cantidadPaga?: number | null
  } | null
  bundleType?: BundleType | null
  items?: BundleComponent[]
  salePrice?: number
  regularPrice?: number
}): PromoRule {
  if (input.rule?.tipoDescuento) {
    return normalizePromoRule(input.rule)
  }
  const items = input.items ?? []
  const qty = items[0]?.quantity ?? 0
  const sale = Number(input.salePrice)
  const regular = Number(input.regularPrice)
  if (
    input.bundleType === "volume_discount" &&
    items.length === 1 &&
    qty === 2 &&
    Number.isFinite(sale) &&
    Number.isFinite(regular) &&
    regular > 0 &&
    Math.abs(sale - regular / 2) < 1
  ) {
    return { ...PROMO_TEMPLATE_2X1 }
  }
  if (
    Number.isFinite(sale) &&
    Number.isFinite(regular) &&
    regular > sale &&
    regular > 0
  ) {
    return normalizePromoRule({
      tipoDescuento: "PORCENTAJE",
      valorDescuento: Math.round(((regular - sale) / regular) * 100),
      cantidadRequerida: 1,
      cantidadPaga: 1,
    })
  }
  return defaultPromoRule()
}

export function bundleSavings(originalPrice: number, salePrice: number): {
  amount: number
  percent: number
} {
  const amount = Math.max(0, Math.round((originalPrice - salePrice) * 100) / 100)
  const percent =
    originalPrice > 0 && salePrice < originalPrice
      ? Math.round((amount / originalPrice) * 100)
      : 0
  return { amount, percent }
}

export function bundleItemQuantitySum(
  items: Array<{ quantity: number }>,
): number {
  return items.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(item.quantity) || 0),
    0,
  )
}

export function bundleAdmitCountMismatchMessage(
  expected: number,
  actual: number,
): string {
  return `Un combo debe emitir ${expected} accesos (la suma de las entradas incluidas). Ahora tiene ${actual}.`
}

export function validateBundleDraft(draft: {
  name: string
  items: BundleComponent[]
  price: number
  capacity: number
  rule?: PromoRule | null
  stockSource?: BundleStockSource
  admitCount?: number
}): string | null {
  if (draft.name.trim().length < 2) {
    return "Nombrá el combo o abono."
  }
  const impliedAccesses = bundleItemQuantitySum(draft.items)
  const admitCount = Math.floor(Number(draft.admitCount) || 0)
  if (impliedAccesses > 0 && admitCount !== impliedAccesses) {
    return bundleAdmitCountMismatchMessage(impliedAccesses, admitCount)
  }
  if (admitCount < 1) {
    return "Indicá cuántos accesos otorga cada compra."
  }
  if (draft.stockSource !== "own" && draft.items.length < 1) {
    return "Elegí al menos una entrada incluida."
  }
  if (draft.rule) {
    const rule = normalizePromoRule(draft.rule)
    if (rule.tipoDescuento === "PORCENTAJE" && rule.valorDescuento > 100) {
      return "El descuento no puede superar el 100%."
    }
    if (rule.tipoDescuento === "X_POR_Y" && rule.cantidadPaga >= rule.cantidadRequerida) {
      return "En un X por Y, la cantidad que se paga debe ser menor a la que se lleva."
    }
  }
  if (!Number.isFinite(draft.price) || draft.price < 0) {
    return "La regla promocional no produjo un precio válido."
  }
  if (!Number.isInteger(draft.capacity) || draft.capacity < 1) {
    return "Definí cuántos combos hay a la venta."
  }
  return null
}

export function bundleIncludesSeating(
  items: BundleComponent[],
  componentTierTypes?: Record<string, string>,
): boolean {
  return items.some(
    (item) => componentTierTypes?.[item.tierId] === "seated",
  )
}
