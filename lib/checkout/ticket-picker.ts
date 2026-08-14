import type { InventoryTierType } from "@/lib/inventory/unified-inventory"

export const DEFAULT_TICKET_TABS = [
  "auto",
  "seated",
  "general",
  "bundle",
  "addon",
] as const

export type DefaultTicketTab = (typeof DEFAULT_TICKET_TABS)[number]

export const TICKET_HIGHLIGHT_BADGES = ["bestseller"] as const

export type TicketHighlightBadge = (typeof TICKET_HIGHLIGHT_BADGES)[number]

export const TICKET_DESCRIPTION_MAX = 180

const TAB_TIE_BREAK: InventoryTierType[] = [
  "general",
  "seated",
  "bundle",
  "addon",
]

export function parseDefaultTicketTab(raw: unknown): DefaultTicketTab {
  const value = String(raw ?? "").trim()
  if ((DEFAULT_TICKET_TABS as readonly string[]).includes(value)) {
    return value as DefaultTicketTab
  }
  return "auto"
}

export function parseTicketHighlightBadge(
  raw: unknown,
): TicketHighlightBadge | null {
  const value = String(raw ?? "").trim()
  if ((TICKET_HIGHLIGHT_BADGES as readonly string[]).includes(value)) {
    return value as TicketHighlightBadge
  }
  return null
}

export function ticketPickerTabLabel(
  type: InventoryTierType,
  tiers: Array<{ name: string }>,
): string {
  if (type === "seated") return "Ubicaciones"
  if (type === "bundle") return "Combos"
  if (type === "addon") return "Extras"
  return generalAdmissionTabLabel(tiers)
}

export function generalAdmissionTabLabel(
  tiers: Array<{ name: string }>,
): string {
  const blob = tiers.map((tier) => tier.name.toLocaleLowerCase("es")).join(" ")
  if (/(^|[^\p{L}])campo([^\p{L}]|$)/u.test(blob)) return "Campo"
  return "Acceso General"
}

export function resolveDefaultTicketPickerTab(input: {
  tabs: InventoryTierType[]
  grouped: Record<InventoryTierType, Array<{ available: number }>>
  configured?: DefaultTicketTab | null
}): InventoryTierType {
  const { tabs, grouped, configured } = input
  if (tabs.length === 0) return "general"

  const parsed = parseDefaultTicketTab(configured)
  if (parsed !== "auto" && tabs.includes(parsed)) return parsed

  let best = tabs[0]
  let bestScore = -1
  for (const tab of tabs) {
    const score = (grouped[tab] ?? []).reduce(
      (sum, tier) => sum + Math.max(0, tier.available),
      0,
    )
    if (score > bestScore) {
      best = tab
      bestScore = score
      continue
    }
    if (score === bestScore && rankTab(tab) < rankTab(best)) {
      best = tab
    }
  }
  return best
}

export function resolveTicketHighlightBadge(
  tier: { id: string; highlightBadge?: TicketHighlightBadge | null; sold?: number },
  peers: Array<{
    id: string
    highlightBadge?: TicketHighlightBadge | null
    sold?: number
  }>,
): TicketHighlightBadge | null {
  if (tier.highlightBadge === "bestseller") return "bestseller"
  const anyManual = peers.some((peer) => peer.highlightBadge === "bestseller")
  if (anyManual) return null

  const maxSold = peers.reduce(
    (max, peer) => Math.max(max, Math.max(0, peer.sold ?? 0)),
    0,
  )
  if (maxSold <= 0) return null
  const winners = peers.filter((peer) => Math.max(0, peer.sold ?? 0) === maxSold)
  if (winners.length !== 1 || winners[0].id !== tier.id) return null
  return "bestseller"
}

function rankTab(tab: InventoryTierType): number {
  const rank = TAB_TIE_BREAK.indexOf(tab)
  return rank === -1 ? TAB_TIE_BREAK.length : rank
}
