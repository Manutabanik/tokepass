import {
  layoutTypeForInventory,
  type InventoryTierType,
} from "@/lib/inventory/unified-inventory"
import type { EventFormValues } from "@/lib/validations/event-form"

export function createInventoryTicket(
  tierType: InventoryTierType,
  options?: { dayId?: string | null },
): EventFormValues["tickets"][number] {
  return {
    isNew: true,
    name: "",
    price: undefined as unknown as number,
    basePrice: undefined,
    feeStrategy: "absorb_in_price",
    calculationMode: "public_price",
    capacity: undefined as unknown as number,
    timeLimit: "",
    bonusReward: "",
    dayId: options?.dayId ?? null,
    visibility: "public",
    layoutType: layoutTypeForInventory(tierType),
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
    admitCount: 1,
    tierType,
    listPrice: tierType === "bundle" ? 0 : null,
    bundleItems: [],
    bundleType: tierType === "bundle" ? "cross_sell_pack" : null,
    promoDiscountType: tierType === "bundle" ? "PORCENTAJE" : null,
    promoDiscountValue: 0,
    promoRequiredQty: 1,
    promoPayQty: 1,
    description: "",
    highlightBadge: null,
    phases: [],
    saleStartsAt: "",
    saleEndsAt: "",
  }
}
