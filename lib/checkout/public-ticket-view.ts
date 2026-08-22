import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { publicTicketOfferKind } from "@/lib/checkout/ticket-offer-kind"
import { normalizeDayId } from "@/lib/event-schedule"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"

export type PublicTicketSource = {
  id: string
  name: string
  price: number
  available?: number | null
  stock_available?: number | null
  stockAvailable?: number | null
  visibility?: string | null
  status?: string | null
  isActive?: boolean | null
  is_active?: boolean | null
  hasMap?: boolean | null
  has_map?: boolean | null
  isMapped?: boolean | null
  is_mapped?: boolean | null
  capacity?: number | null
  bonus_reward?: string | null
  day_id?: string | null
  layout_type?: string | null
  seating_sector_id?: string | null
  capacity_per_unit?: number | null
  min_purchase_limit?: number | null
  max_purchase_limit?: number | null
  category?: string | null
  list_price?: number | null
  tier_type?: string | null
  bundle_type?: string | null
  description?: string | null
  highlight_badge?: TicketSelectorTier["highlightBadge"]
  sold?: number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  phases?: TicketSelectorTier["phases"]
}

function asLayoutType(
  value: string | null | undefined,
): TicketSelectorTier["layoutType"] {
  if (value === "table_combo" || value === "numbered_seat") return value
  return "general"
}

export function publicTicketStock(ticket: {
  available?: number | null
  stock_available?: number | null
  stockAvailable?: number | null
}): number {
  const raw =
    ticket.stock_available ?? ticket.stockAvailable ?? ticket.available
  const parsed = Math.floor(Number(raw))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function isPublicTicketActive(ticket: {
  visibility?: string | null
  status?: string | null
  isActive?: boolean | null
  is_active?: boolean | null
}): boolean {
  if (ticket.isActive === false || ticket.is_active === false) return false
  if ((ticket.visibility ?? "public") === "private") return false
  const status = ticket.status?.trim()
  if (!status) return true
  return status.toUpperCase() === "ACTIVE"
}

export function ticketUsesMapSelector(tier: {
  hasMap?: boolean | null
  has_map?: boolean | null
  isMapped?: boolean | null
  is_mapped?: boolean | null
  seatingSectorId?: string | null
  seating_sector_id?: string | null
  layoutType?: string | null
  layout_type?: string | null
  tierType?: string | null
  tier_type?: string | null
  category?: string | null
  comboItems?: Array<{ name: string; quantity: number }>
}): boolean {
  if (tier.hasMap === true || tier.has_map === true) return true
  if (tier.isMapped === true || tier.is_mapped === true) return true
  if (tier.hasMap === false || tier.has_map === false) return false
  if (tier.isMapped === false || tier.is_mapped === false) return false
  return isMapBackedTicket({
    seatingSectorId: tier.seatingSectorId ?? tier.seating_sector_id,
    layoutType: tier.layoutType ?? tier.layout_type,
    tierType: tier.tierType ?? tier.tier_type,
    category: tier.category,
    bundleItems: (tier.comboItems ?? []).map((item, index) => ({
      tierId: `combo-${index}`,
      quantity: item.quantity,
    })),
  })
}

const EMPTY_PUBLIC_TICKETS: readonly never[] = []

export function publicEventTickets<T>(event: {
  tiers?: readonly T[] | null
  ticket_types?: readonly T[] | null
  ticketTiers?: readonly T[] | null
}): readonly T[] {
  return (
    event.tiers ??
    event.ticket_types ??
    event.ticketTiers ??
    EMPTY_PUBLIC_TICKETS
  )
}

export function toPublicTicketSelectorTier(
  tier: PublicTicketSource,
  extras: {
    comboItems?: Array<{ name: string; quantity: number }>
  } = {},
): TicketSelectorTier {
  const comboItems = extras.comboItems ?? []
  const mapped = ticketUsesMapSelector({
    hasMap: tier.hasMap ?? tier.has_map,
    isMapped: tier.isMapped ?? tier.is_mapped,
    seating_sector_id: tier.seating_sector_id,
    layout_type: tier.layout_type,
    tier_type: tier.tier_type,
    category: tier.category,
    comboItems,
  })
  return {
    id: tier.id,
    name: tier.name,
    price: Number(tier.price) || 0,
    available: publicTicketStock(tier),
    isActive: isPublicTicketActive(tier),
    hasMap: mapped,
    isMapped: mapped,
    status: tier.status ?? undefined,
    stockAvailable: publicTicketStock(tier),
    capacity: Number(tier.capacity) || 0,
    bonusReward: tier.bonus_reward,
    dayId: tier.day_id,
    dateId: normalizeDayId(tier.day_id),
    isFullPass:
      publicTicketOfferKind({
        name: tier.name,
        dayId: tier.day_id,
        tierType: tier.tier_type,
        bundleType: tier.bundle_type,
        category: tier.category,
        layoutType: tier.layout_type,
        comboItems,
      }) === "PASS",
    layoutType: asLayoutType(tier.layout_type),
    seatingSectorId: tier.seating_sector_id,
    capacityPerUnit: Number(tier.capacity_per_unit) || 1,
    minPurchaseLimit: tier.min_purchase_limit ?? 1,
    maxPurchaseLimit: tier.max_purchase_limit ?? null,
    category: tier.category,
    listPrice: tier.list_price,
    comboItems,
    tierType: tier.tier_type,
    bundleType: tier.bundle_type,
    description: tier.description,
    highlightBadge: tier.highlight_badge,
    sold: Number(tier.sold) || 0,
    saleStartsAt: tier.sale_starts_at ?? null,
    saleEndsAt: tier.sale_ends_at ?? null,
    phases: tier.phases ?? [],
  }
}
