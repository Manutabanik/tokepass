"use client"

import { Armchair, Car, Gift, Ticket } from "lucide-react"

import { PricingStep } from "@/components/admin/events/pricing-step"
import { createInventoryTicket } from "@/lib/inventory/create-inventory-ticket"
import type { InventoryTierType } from "@/lib/inventory/unified-inventory"
import type { EventFormValues } from "@/lib/validations/event-form"
import type { UseFormReturn } from "react-hook-form"

export { createInventoryTicket }

type Props = {
  form: UseFormReturn<EventFormValues>
  eventId?: string | null
  feePercentage?: number
  fixedFee?: number
  isSponsored?: boolean
  hideMapBlock?: boolean
  onOpenMapStudio?: () => void
  onSyncMapToTickets?: () => void
  onDisableMap?: () => void
  onRemoveMapSector?: (sectorId: string | null) => void
}

export function UnifiedInventoryPanel(props: Props) {
  return <PricingStep {...props} />
}

export function InventoryTypeIcon({
  tierType,
  className,
}: {
  tierType: InventoryTierType
  className?: string
}) {
  const Icon =
    tierType === "seated"
      ? Armchair
      : tierType === "addon"
        ? Car
        : tierType === "bundle"
          ? Gift
          : Ticket
  return <Icon className={className} aria-hidden="true" />
}
