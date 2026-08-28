"use client"

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
  selectedDateId,
  onSelectedDateIdChange,
  onFocusedTierIdChange,
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
  selectedDateId?: string | null
  onSelectedDateIdChange?: (dateId: string) => void
  onFocusedTierIdChange?: (tierId: string | null) => void
}) {
  const quantities = useCheckoutStore((state) => state.quantities)
  const selectedSeat = useCheckoutStore((state) => state.selectedSeat)
  const seatSheetOpen = useCheckoutStore((state) => state.seatSheetOpen)

  const selector = (
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
      seatSelection={hasInteractiveMap ? seatSelection : null}
      onPurchaseIntent={onPurchaseIntent}
      onClearSeat={onClearSeat}
      seatSheetOpen={hasInteractiveMap ? seatSheetOpen : false}
      onSeatSheetOpenChange={(open) =>
        useCheckoutStore.getState().setSeatSheetOpen(open)
      }
      selectedDateId={selectedDateId}
      onSelectedDateIdChange={onSelectedDateIdChange}
      onFocusedTierIdChange={onFocusedTierIdChange}
    />
  )

  return (
    <div className="mx-auto flex min-h-0 w-full flex-col">
      {selector}
    </div>
  )
}
