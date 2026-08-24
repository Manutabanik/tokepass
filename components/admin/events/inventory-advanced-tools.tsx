"use client"

import { Car, Gift, LayoutGrid, Plus } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import type {
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFieldArrayUpdate,
  UseFormReturn,
} from "react-hook-form"

import {
  BundleEditorSheet,
  type BundleComponentOption,
} from "@/components/admin/bundle-creator-modal"
import { AddonEditorSheet } from "@/components/admin/events/addon-editor-sheet"
import {
  INVENTORY_TIER_ICONS,
  InventoryTierSummaryRow,
} from "@/components/admin/events/inventory-summary-row"
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DEFAULT_TICKET_TABS,
  generalAdmissionTabLabel,
  ticketPickerTabLabel,
} from "@/lib/checkout/ticket-picker"
import { defaultInventoryDayId } from "@/lib/event-schedule"
import {
  bundleIncludesSeating,
  inferBundleType,
  inferPromoRule,
} from "@/lib/inventory/flexible-bundles"
import { createInventoryTicket } from "@/lib/inventory/create-inventory-ticket"
import { ticketSoldCount } from "@/lib/inventory/synced-day-tickets"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"

const EMPTY_FORM_TICKETS: EventFormValues["tickets"] = []

type IndexedTier = {
  index: number
  key: string
  tierType: ReturnType<typeof inferInventoryTierType>
}

type AddonSheetState = {
  index: number
  created: boolean
}

type BundleSheetState = {
  index: number | null
  created: boolean
}

function asMoney(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function asStock(value: unknown): number {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function listAdvancedTiers(
  tickets: EventFormValues["tickets"],
): IndexedTier[] {
  return tickets
    .map((tier, index) => {
      const tierType = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      })
      return {
        index,
        tierType,
        key: tier.id ?? `ticket-${index}`,
      }
    })
    .filter((item) => {
      const tier = tickets[item.index]
      return tier != null && !isMapBackedTicket(tier)
    })
}

export function InventoryAdvancedTools({
  form,
  appendTicket,
  updateTicket,
  removeTicket,
  feePercentage = 15,
  fixedFee = 0,
  isSponsored = false,
}: {
  form: UseFormReturn<EventFormValues>
  appendTicket: UseFieldArrayAppend<EventFormValues, "tickets">
  updateTicket: UseFieldArrayUpdate<EventFormValues, "tickets">
  removeTicket: UseFieldArrayRemove
  feePercentage?: number
  fixedFee?: number
  isSponsored?: boolean
}) {
  const watchedTickets = form.watch("tickets")
  const tickets = watchedTickets ?? EMPTY_FORM_TICKETS
  const eventDates = form.watch("basics.scheduleDays") ?? []
  const [addonSheet, setAddonSheet] = useState<AddonSheetState | null>(null)
  const [bundleSheet, setBundleSheet] = useState<BundleSheetState | null>(null)

  const grouped = useMemo(() => listAdvancedTiers(tickets), [tickets])
  const addons = grouped.filter((item) => item.tierType === "addon")
  const bundles = grouped.filter((item) => item.tierType === "bundle")

  function remove(index: number) {
    if (ticketSoldCount(tickets[index]) > 0) return
    removeTicket(index)
    if (addonSheet?.index === index) setAddonSheet(null)
    if (bundleSheet?.index === index) setBundleSheet(null)
  }

  function addAddon() {
    const start = tickets.length
    appendTicket(
      createInventoryTicket("addon", {
        dayId: defaultInventoryDayId(eventDates),
      }),
    )
    setAddonSheet({ index: start, created: true })
  }

  function openAddon(index: number) {
    setAddonSheet({ index, created: false })
  }

  function closeAddonSheet(open: boolean) {
    if (open) return
    if (addonSheet) {
      const ticket = form.getValues(`tickets.${addonSheet.index}`)
      const stillBlank =
        !ticket?.name?.trim() &&
        !(Number(ticket?.capacity) > 0) &&
        !(Number(ticket?.price) > 0)
      if (addonSheet.created && stillBlank) {
        removeTicket(addonSheet.index)
      }
    }
    setAddonSheet(null)
  }

  function addBundle() {
    setBundleSheet({ index: null, created: true })
  }

  function openBundle(index: number) {
    setBundleSheet({ index, created: false })
  }

  function closeBundleSheet(open: boolean) {
    if (open) return
    setBundleSheet(null)
  }

  const componentOptions: BundleComponentOption[] = tickets
    .map((tier, index) => ({
      id: tier.id ?? `index:${index}`,
      name: tier.name || `Ítem ${index + 1}`,
      price: Number(tier.price) || 0,
      tierType: inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      }),
      dayId: tier.dayId,
    }))
    .filter((item) => item.tierType !== "bundle")

  const generalNames = tickets
    .filter(
      (tier) =>
        inferInventoryTierType({
          tierType: tier.tierType,
          layoutType: tier.layoutType,
          bundleItems: tier.bundleItems,
        }) === "general",
    )
    .map((tier) => ({ name: tier.name }))

  const defaultTabItems = DEFAULT_TICKET_TABS.map((value) => {
    if (value === "auto") {
      return { value, label: "Automático (la de más stock)" }
    }
    if (value === "general") {
      return { value, label: generalAdmissionTabLabel(generalNames) }
    }
    return { value, label: ticketPickerTabLabel(value, []) }
  })

  const editingBundleIndex = bundleSheet?.index ?? null

  return (
    <div className="space-y-5">
      <FormField
        control={form.control}
        name="ticketsDefaultTab"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground/90">
              <LayoutGrid className="size-3.5" aria-hidden="true" />
              Tab inicial en la compra
            </FormLabel>
            <Select
              value={field.value ?? "auto"}
              onValueChange={field.onChange}
              items={defaultTabItems}
            >
              <SelectTrigger className="h-11 w-full max-w-md rounded-xl text-sm">
                <SelectValue placeholder="Automatico">
                  {defaultTabItems.find(
                    (item) => item.value === (field.value ?? "auto"),
                  )?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {defaultTabItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>
              Qué tipo de entrada se ve primero en la compra.
            </FormDescription>
          </FormItem>
        )}
      />

      <AdvancedBlock
        title="Adicionales"
        description="Estacionamiento, consumiciones u otros extras."
        icon={Car}
        actionLabel="Agregar adicional"
        onAdd={addAddon}
      >
        {addons.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Los adicionales aparecen como upsell antes del pago.
          </p>
        ) : (
          <div className="space-y-2">
            {addons.map((item) => {
              const tier = tickets[item.index]
              if (!tier) return null
              return (
                <InventoryTierSummaryRow
                  key={item.key}
                  name={tier.name?.trim() || "Adicional sin nombre"}
                  stock={asStock(tier.capacity)}
                  sold={ticketSoldCount(tier)}
                  price={asMoney(tier.price)}
                  icon={INVENTORY_TIER_ICONS.addon}
                  onEdit={() => openAddon(item.index)}
                  onRemove={() => remove(item.index)}
                />
              )
            })}
          </div>
        )}
      </AdvancedBlock>

      <AdvancedBlock
        title="Combos y abonos"
        description="Packs, 2x1 y pases de varios días."
        icon={Gift}
        actionLabel="Crear combo / abono"
        onAdd={addBundle}
      >
        {bundles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ejemplo: Pack 4x3 o abono de todo el festival.
          </p>
        ) : (
          <div className="space-y-2">
            {bundles.map((item) => {
              const tier = tickets[item.index]
              if (!tier) return null
              return (
                <InventoryTierSummaryRow
                  key={item.key}
                  name={tier.name?.trim() || "Combo sin nombre"}
                  stock={asStock(tier.capacity)}
                  sold={ticketSoldCount(tier)}
                  price={asMoney(tier.price)}
                  icon={INVENTORY_TIER_ICONS.bundle}
                  onEdit={() => openBundle(item.index)}
                  onRemove={() => remove(item.index)}
                />
              )
            })}
          </div>
        )}
      </AdvancedBlock>

      {addonSheet ? (
        <AddonEditorSheet
          form={form}
          update={updateTicket}
          open
          onOpenChange={closeAddonSheet}
          index={addonSheet.index}
          feePercentage={feePercentage}
          fixedFee={fixedFee}
          isSponsored={isSponsored}
        />
      ) : null}

      {bundleSheet ? (
        <BundleEditorSheet
          open
          onOpenChange={closeBundleSheet}
          title={
            editingBundleIndex == null
              ? "Crear combo / abono"
              : "Editar combo / abono"
          }
          scheduleDays={eventDates}
          options={componentOptions}
          initial={
            editingBundleIndex != null
              ? {
                  name: tickets[editingBundleIndex]?.name,
                  bundleType: inferBundleType({
                    bundleType: tickets[editingBundleIndex]?.bundleType,
                    dayId: tickets[editingBundleIndex]?.dayId,
                    items: tickets[editingBundleIndex]?.bundleItems,
                  }),
                  price: tickets[editingBundleIndex]?.price ?? 0,
                  originalPrice: tickets[editingBundleIndex]?.listPrice ?? 0,
                  capacity: tickets[editingBundleIndex]?.capacity,
                  admitCount: tickets[editingBundleIndex]?.admitCount ?? 1,
                  stockSource:
                    (tickets[editingBundleIndex]?.bundleItems?.length ?? 0) > 0
                      ? "linked"
                      : "own",
                  items: tickets[editingBundleIndex]?.bundleItems ?? [],
                  promoRule: inferPromoRule({
                    rule: tickets[editingBundleIndex]?.promoDiscountType
                      ? {
                          tipoDescuento:
                            tickets[editingBundleIndex].promoDiscountType,
                          valorDescuento:
                            tickets[editingBundleIndex]?.promoDiscountValue ??
                            0,
                          cantidadRequerida:
                            tickets[editingBundleIndex]?.promoRequiredQty ?? 1,
                          cantidadPaga:
                            tickets[editingBundleIndex]?.promoPayQty ?? 1,
                        }
                      : null,
                    bundleType: tickets[editingBundleIndex]?.bundleType,
                    items: tickets[editingBundleIndex]?.bundleItems,
                    salePrice: tickets[editingBundleIndex]?.price ?? 0,
                    regularPrice: tickets[editingBundleIndex]?.listPrice ?? 0,
                  }),
                  includesSeating: bundleIncludesSeating(
                    tickets[editingBundleIndex]?.bundleItems ?? [],
                    Object.fromEntries(
                      tickets.map((tier, index) => [
                        tier.id ?? `index:${index}`,
                        inferInventoryTierType({
                          tierType: tier.tierType,
                          layoutType: tier.layoutType,
                          bundleItems: tier.bundleItems,
                        }),
                      ]),
                    ),
                  ),
                }
              : null
          }
          onSave={(value) => {
            const nextTicket = {
              ...createInventoryTicket("bundle"),
              name: value.name,
              price: value.price,
              listPrice: value.originalPrice,
              capacity: value.capacity,
              admitCount: value.admitCount,
              bundleItems: value.items,
              bundleType: value.bundleType,
              promoDiscountType: value.promoRule.tipoDescuento,
              promoDiscountValue: value.promoRule.valorDescuento,
              promoRequiredQty: value.promoRule.cantidadRequerida,
              promoPayQty: value.promoRule.cantidadPaga,
              dayId:
                value.bundleType === "multi_day_pass"
                  ? null
                  : defaultInventoryDayId(eventDates),
            }
            if (editingBundleIndex == null) {
              appendTicket(nextTicket)
            } else {
              const current = tickets[editingBundleIndex]
              if (current) {
                updateTicket(editingBundleIndex, {
                  ...current,
                  ...nextTicket,
                  id: current.id,
                })
              }
            }
            setBundleSheet(null)
          }}
        />
      ) : null}
    </div>
  )
}

function AdvancedBlock({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAdd,
  children,
}: {
  title: string
  description: string
  icon: typeof Car
  actionLabel: string
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-3.5 text-muted-foreground" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-300 px-3 text-sm font-medium text-foreground hover:border-emerald-500 dark:border-zinc-700"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        {actionLabel}
      </button>
    </section>
  )
}
