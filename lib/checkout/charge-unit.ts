import { formatTicketPrice } from "@/lib/format"
import { centsToMoney, moneyToCents } from "@/lib/money/cents"

export type ChargeUnitType = "per_person" | "full_table"
export type ChargeNoun = "mesa" | "palco" | "lugar"
export type ChargeSellMode = "per_seat" | "group"
export type ChargePriceMode = "closed_unit" | "per_person"

export type ChargeUnit = {
  unitType: ChargeUnitType
  capacity: number
  noun: ChargeNoun
  badge: string | null
  sellMode: ChargeSellMode
  priceMode: ChargePriceMode
}

function titleNoun(noun: ChargeNoun, count = 1) {
  if (noun === "palco") return count === 1 ? "Palco" : "Palcos"
  if (noun === "mesa") return count === 1 ? "Mesa" : "Mesas"
  return count === 1 ? "Lugar" : "Lugares"
}

export function resolveChargeNoun(name?: string | null): ChargeNoun {
  return /palco/i.test(name ?? "") ? "palco" : "mesa"
}

/** Closed unit: 1 mesa/palco = 1 stock SKU = 1 price. Never multiply by chairs. */
export function isClosedUnitPricing(input: {
  sellMode?: string | null
  priceMode?: string | null
}): boolean {
  if (input.priceMode === "closed_unit") return true
  if (input.priceMode === "per_person") return false
  return input.sellMode === "group"
}

export function storefrontLinePlaces(item: { capacity?: number | null }): number {
  return Math.max(1, Math.floor(item.capacity ?? 1) || 1)
}

/**
 * Money for one cart line.
 * group / closed_unit -> `price` (P87: ticket_tiers.price is All-In per SKU unit).
 * per_seat / per_person -> `price * places`.
 */
export function storefrontLineTotal(item: {
  price: number
  capacity?: number | null
  sellMode?: string | null
  priceMode?: string | null
  type?: string | null
  inventoryType?: string | null
}): number {
  const parsed = Number(item.price)
  const price =
    item.price === undefined || item.price === null || !Number.isFinite(parsed)
      ? 0
      : Math.max(0, parsed)
  if (
    item.inventoryType === "TABLES" ||
    item.type === "table" ||
    isClosedUnitPricing(item)
  ) {
    return centsToMoney(moneyToCents(price))
  }
  return centsToMoney(moneyToCents(price) * storefrontLinePlaces(item))
}

/**
 * Units sent to ticket_tiers sold / setQuantities.
 * P87: 1 reserved table_combo = 1 SKU unit. Chairs (capacity_per_unit) must not
 * multiply stock.
 */
export function storefrontLineSkuQuantity(item: {
  type?: string | null
  capacity?: number | null
  sellMode?: string | null
  priceMode?: string | null
  inventoryType?: string | null
}): number {
  if (item.inventoryType === "TABLES" || item.type === "table") return 1
  if (item.type === "seat") return 1
  if (isClosedUnitPricing(item)) return 1
  return storefrontLinePlaces(item)
}

export function resolveChargeUnit(input: {
  layoutType?: string | null
  capacityPerUnit?: number | null
  sellMode?: ChargeSellMode | null
  priceMode?: ChargePriceMode | null
  isTableSector?: boolean
  name?: string | null
}): ChargeUnit {
  const capacity = Math.max(1, Math.floor(input.capacityPerUnit ?? 1) || 1)
  const noun = resolveChargeNoun(input.name)
  const isTable =
    Boolean(input.isTableSector) ||
    input.layoutType === "table_combo" ||
    (capacity > 1 && input.layoutType !== "general" && input.layoutType !== "numbered_seat")
  const closed = isClosedUnitPricing(input)

  if (!isTable) {
    return {
      unitType: "per_person",
      capacity: 1,
      noun: "lugar",
      badge: null,
      sellMode: "per_seat",
      priceMode: "per_person",
    }
  }

  if (closed) {
    return {
      unitType: "full_table",
      capacity,
      noun,
      badge: `INCLUYE ${capacity} ACCESOS`,
      sellMode: "group",
      priceMode: "closed_unit",
    }
  }

  return {
    unitType: "per_person",
    capacity,
    noun,
    badge: "por persona",
    sellMode: "per_seat",
    priceMode: "per_person",
  }
}

export function displayChargePrice(unit: ChargeUnit, unitPrice: number) {
  const price = Math.max(0, Number(unitPrice) || 0)
  if (unit.unitType === "full_table" && unit.sellMode !== "group") {
    return price * unit.capacity
  }
  return price
}

export function formatChargeFormula(input: {
  units: number
  unitType: ChargeUnitType
  capacity: number
  unitPrice: number
  noun: ChargeNoun
  sellMode?: ChargeSellMode
  priceMode?: ChargePriceMode
}): string {
  const units = Math.max(1, Math.floor(input.units) || 1)
  const capacity = Math.max(1, Math.floor(input.capacity) || 1)
  const unitPrice = Math.max(0, Number(input.unitPrice) || 0)
  const priceLabel = formatTicketPrice(unitPrice)
  const closed = isClosedUnitPricing(input)

  if (closed) {
    const people = input.unitType === "full_table" ? units * capacity : units
    const total = units * unitPrice
    const peopleLabel = people === 1 ? "persona incluida" : "personas incluidas"
    return `${units} ${titleNoun(input.noun, units)} (${people} ${peopleLabel}) = ${formatTicketPrice(total)}`
  }

  const places = input.unitType === "full_table" ? units * capacity : units
  const placesLabel = places === 1 ? "lugar" : "lugares"
  return `${places} ${placesLabel} \u00d7 ${priceLabel}/persona = ${formatTicketPrice(
    places * unitPrice,
  )}`
}

export function formatSelectionChargeDetail(input: {
  type?: string | null
  name?: string | null
  capacity?: number | null
  unitPrice: number
  quantity?: number | null
  sellMode?: ChargeSellMode | null
  priceMode?: ChargePriceMode | null
}): string {
  const capacity = Math.max(1, Math.floor(input.capacity ?? 1) || 1)
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1) || 1)
  const noun = resolveChargeNoun(input.name)
  const isTable = input.type === "table" || (capacity > 1 && input.type !== "seat")
  const sellMode = input.sellMode === "group" ? "group" : "per_seat"
  const priceMode = input.priceMode ?? (sellMode === "group" ? "closed_unit" : "per_person")
  const closed = isClosedUnitPricing({ sellMode, priceMode })

  if (isTable) {
    const seats = capacity
    if (closed || input.type === "table") {
      const nounLabel = noun === "palco" ? "Palco completo" : "Mesa completa"
      return `1x ${nounLabel} (Incluye ${seats} accesos)`
    }
    return formatChargeFormula({
      units: quantity,
      unitType: "full_table",
      capacity,
      unitPrice: input.unitPrice,
      noun,
      sellMode,
      priceMode,
    })
  }

  return formatChargeFormula({
    units: quantity * capacity,
    unitType: "per_person",
    capacity: 1,
    unitPrice: input.unitPrice,
    noun: "lugar",
    sellMode,
    priceMode,
  })
}
