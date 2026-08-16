"use client"

import { CartSummary } from "@/components/public/cart-summary"
import {
  EventCheckoutSelector,
  type SelectedNumberedSeat,
} from "@/components/public/event-checkout-selector"
import type { SeatSelectionContext } from "@/components/public/seat-selection-sheet"
import type { TicketSelectorTier } from "@/components/public/ticket-tier-selector"
import { useCheckoutStore } from "@/lib/stores/checkout-store"
import type { ScheduleDay } from "@/types/events"

export function CheckoutTicketList({
  tiers,
  isPending,
  hasSeatingFlow,
  hasInteractiveMap,
  scheduleDays,
  maxTicketsPerUser,
  selectedCount,
  includesGeneralAccess,
  focusedTierId,
  mapLoading,
  selectedPlaceCount,
  onQuantityChange,
  onOpenSeatFlow,
  onPurchaseIntent,
  onClearSeat,
  seatSelection,
}: {
  tiers: TicketSelectorTier[]
  isPending: boolean
  hasSeatingFlow: boolean
  hasInteractiveMap: boolean
  scheduleDays: ScheduleDay[]
  maxTicketsPerUser?: number | null
  selectedCount: number
  includesGeneralAccess: boolean
  focusedTierId: string | null
  mapLoading: boolean
  selectedPlaceCount: number
  onQuantityChange: (tierId: string, quantity: number, max: number) => void
  onOpenSeatFlow: () => void
  onPurchaseIntent: () => void
  onClearSeat: () => void
  seatSelection: SeatSelectionContext | null
}) {
  const quantities = useCheckoutStore((state) => state.quantities)
  const selectedSeat = useCheckoutStore((state) => state.selectedSeat)
  const cartLines = useCheckoutStore((state) => state.lines)
  const seatSheetOpen = useCheckoutStore((state) => state.seatSheetOpen)

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <EventCheckoutSelector
        tiers={tiers}
        quantities={quantities}
        isPending={isPending}
        hasSeatingFlow={hasSeatingFlow}
        hasInteractiveMap={hasInteractiveMap}
        scheduleDays={scheduleDays}
        maxTicketsPerUser={maxTicketsPerUser}
        selectedCount={selectedCount}
        includesGeneralAccess={includesGeneralAccess}
        focusedTierId={focusedTierId}
        mapLoading={mapLoading}
        selectedSeat={selectedSeat as SelectedNumberedSeat | null}
        selectedPlaceCount={selectedPlaceCount}
        onQuantityChange={onQuantityChange}
        onOpenSeatFlow={onOpenSeatFlow}
        seatSelection={seatSelection}
        onPurchaseIntent={onPurchaseIntent}
        onClearSeat={onClearSeat}
        seatSheetOpen={seatSheetOpen}
        onSeatSheetOpenChange={(open) =>
          useCheckoutStore.getState().setSeatSheetOpen(open)
        }
      />
      {cartLines.length > 0 ? (
        <CartSummary className="mt-4 hidden lg:block" items={cartLines} />
      ) : null}
    </div>
  )
}
