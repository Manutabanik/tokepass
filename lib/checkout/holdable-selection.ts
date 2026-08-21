import type { StorefrontSelectedItem } from "@/lib/stores/storefront-seat-store"

export function isHoldableStorefrontItem(
  item: Pick<StorefrontSelectedItem, "type">,
): boolean {
  return item.type === "seat" || item.type === "table"
}

export function holdableStorefrontItems(
  items: readonly StorefrontSelectedItem[],
): StorefrontSelectedItem[] {
  return items.filter(isHoldableStorefrontItem)
}
