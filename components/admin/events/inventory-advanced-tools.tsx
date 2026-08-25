"use client"

import { Car, Gift, LayoutGrid, Pencil, Plus } from "lucide-react"
import { useState, type ReactNode } from "react"
import type {
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFieldArrayUpdate,
  UseFormReturn,
} from "react-hook-form"

import {
  BundleCreatorModal,
  type BundleComponentOption,
} from "@/components/admin/bundle-creator-modal"
import { ExtraSheet, isBlankExtraTicket } from "@/components/admin/events/extra-sheet"
import { ExtraSummaryRow } from "@/components/admin/events/extra-summary-row"
import { TicketWalletCard } from "@/components/admin/events/ticket-tier-form"
import { Button } from "@/components/ui/button"
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
import { createInventoryTicket } from "@/lib/inventory/create-inventory-ticket"
import { ticketSoldCount } from "@/lib/inventory/synced-day-tickets"
import {
  inferBundleType,
  inferPromoRule,
  bundleIncludesSeating,
} from "@/lib/inventory/flexible-bundles"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import {
  DEFAULT_TICKET_TABS,
  generalAdmissionTabLabel,
  ticketPickerTabLabel,
} from "@/lib/checkout/ticket-picker"
import { defaultInventoryDayId } from "@/lib/event-schedule"
import { isMapBackedTicket } from "@/lib/seating/venue-map-pricing"
import type { EventFormValues } from "@/lib/validations/event-form"

const EMPTY_FORM_TICKETS: EventFormValues["tickets"] = []

type ExtraSheetState = {
  index: number
  created: boolean
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
  const tickets = form.getValues("tickets") ?? watchedTickets ?? EMPTY_FORM_TICKETS
  const eventDates = form.watch("basics.scheduleDays") ?? []
  const [bundleOpen, setBundleOpen] = useState(false)
  const [editingBundleIndex, setEditingBundleIndex] = useState<number | null>(
    null,
  )
  const [extraSheet, setExtraSheet] = useState<ExtraSheetState | null>(null)

  const grouped = tickets
    .map((tier, index) => {
      const tierType = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      })
      return { index, tierType, key: tier.id ?? `ticket-${index}`, tier }
    })
    .filter((item) => !isMapBackedTicket(item.tier))
  const addons = grouped.filter((item) => item.tierType === "addon")
  const bundles = grouped.filter((item) => item.tierType === "bundle")

  function append(ticket: EventFormValues["tickets"][number]) {
    appendTicket(ticket)
  }

  function remove(index: number) {
    if (ticketSoldCount(tickets[index]) > 0) return
    removeTicket(index)
    if (extraSheet?.index === index) {
      setExtraSheet(null)
    }
  }

  function addExtra() {
    const dayId = defaultInventoryDayId(eventDates)
    const next = createInventoryTicket("addon", { dayId })
    const start = (form.getValues("tickets") ?? []).length
    appendTicket(next)
    setExtraSheet({ index: start, created: true })
  }

  function openExtra(index: number) {
    setExtraSheet({ index, created: false })
  }

  function closeExtraSheet(open: boolean) {
    if (open) return
    if (extraSheet) {
      const ticket = form.getValues(`tickets.${extraSheet.index}`)
      if (extraSheet.created && isBlankExtraTicket(ticket)) {
        removeTicket(extraSheet.index)
      }
    }
    setExtraSheet(null)
  }

  function duplicate(index: number) {
    const source = tickets[index]
    if (!source) return
    append({
      ...source,
      id: undefined,
      isNew: true,
      name: source.name.trim() ? `${source.name.trim()} copia` : "",
      sold: 0,
      phases: (source.phases ?? []).map((phase) => ({
        ...phase,
        id: undefined,
        sold: 0,
      })),
    })
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
                <SelectValue placeholder="Automático">
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
        onAdd={addExtra}
      >
        {addons.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Los adicionales aparecen como upsell antes del pago.
          </p>
        ) : (
          <div className="space-y-2">
            {addons.map((item) => (
              <ExtraSummaryRow
                key={item.key}
                ticket={item.tier}
                index={item.index}
                onEdit={() => openExtra(item.index)}
                onRemove={() => remove(item.index)}
              />
            ))}
          </div>
        )}
      </AdvancedBlock>

      <AdvancedBlock
        title="Combos y abonos"
        description="Packs, 2x1 y pases de varios días."
        icon={Gift}
        actionLabel="Crear combo / abono"
        onAdd={() => {
          setEditingBundleIndex(null)
          setBundleOpen(true)
        }}
      >
        {bundles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ejemplo: Pack 4x3 o abono de todo el festival.
          </p>
        ) : (
          bundles.map((item) => (
            <div key={item.key} className="space-y-2">
              <TicketWalletCard
                form={form}
                index={item.index}
                onDuplicate={() => duplicate(item.index)}
                onRemove={() => remove(item.index)}
                capacityLabel="Cupo promocional"
                feePercentage={feePercentage}
                fixedFee={fixedFee}
                isSponsored={isSponsored}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingBundleIndex(item.index)
                  setBundleOpen(true)
                }}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Editar combo
              </Button>
            </div>
          ))
        )}
      </AdvancedBlock>

      <BundleCreatorModal
        open={bundleOpen}
        onOpenChange={setBundleOpen}
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
                          tickets[editingBundleIndex]?.promoDiscountValue ?? 0,
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
          setBundleOpen(false)
          setEditingBundleIndex(null)
        }}
      />

      {extraSheet ? (
        <ExtraSheet
          form={form}
          update={updateTicket}
          open
          onOpenChange={closeExtraSheet}
          index={extraSheet.index}
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
      <Button type="button" variant="outline" onClick={onAdd} className="h-10">
        <Plus className="size-3.5" aria-hidden="true" />
        {actionLabel}
      </Button>
    </section>
  )
}

