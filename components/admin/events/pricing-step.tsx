"use client"

import { Map, Plus, Ticket } from "lucide-react"
import { useMemo, useState } from "react"
import { useFieldArray, type UseFormReturn } from "react-hook-form"

import { CapacityThermometer } from "@/components/admin/events/capacity-thermometer"
import { InventoryAdvancedTools } from "@/components/admin/events/inventory-advanced-tools"
import { InventorySummaryRow } from "@/components/admin/events/inventory-summary-row"
import {
  sheetDifferentiateDefault,
  TicketEditorSheet,
} from "@/components/admin/events/ticket-editor-sheet"
import { FormLabel, FormMessage } from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { listEventFormJornadas } from "@/lib/event-schedule"
import { createInventoryTicket } from "@/lib/inventory/create-inventory-ticket"
import { eventHasActiveSeatingMap } from "@/lib/inventory/map-enablement"
import {
  listInventoryFamilies,
  planMissingFamilyDayTickets,
  type InventoryFamily,
} from "@/lib/inventory/synced-day-tickets"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { STUDIO_LABEL_CLASS } from "@/lib/admin/studio-form-styles"
import { clampServiceFeePercentage } from "@/lib/pricing/net-profit"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

const EMPTY_FORM_TICKETS: EventFormValues["tickets"] = []

type SheetState = {
  indexes: number[]
  kind: "general" | "map"
  created: boolean
  differentiate: boolean
  appendedIndexes: number[]
}

export function PricingStep({
  form,
  feePercentage = 15,
  fixedFee = 0,
  isSponsored = false,
  hideMapBlock = false,
  onOpenMapStudio,
  onSyncMapToTickets,
  onDisableMap,
  onRemoveMapSector,
}: {
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
}) {
  const { append, update, remove } = useFieldArray({
    control: form.control,
    name: "tickets",
    keyName: "_rowId",
  })
  const tickets = form.watch("tickets") ?? EMPTY_FORM_TICKETS
  const resolvedFeePercentage = clampServiceFeePercentage(
    form.watch("serviceFeePercentage") ?? feePercentage,
  )
  const scheduleDays = form.watch("basics.scheduleDays") ?? []
  const identityDate = form.watch("basics.date")
  const hasSeatingPlan = Boolean(form.watch("basics.hasSeatingPlan"))
  const includesSeatingMap = Boolean(form.watch("venue.includesSeatingMap"))
  const venueMap = form.watch("venue.venueMap")
  const mapEnabled = eventHasActiveSeatingMap({
    hasSeatingPlan,
    includesSeatingMap,
    venueMap,
  })
  const eventDates = listEventFormJornadas({
    scheduleDays,
    date: identityDate,
  })
  const isMultiDay =
    Boolean(form.watch("basics.isMultiDay")) || eventDates.length >= 2
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [showExtras, setShowExtras] = useState(() => {
    const current = form.getValues("tickets") ?? []
    return current.some((tier) => {
      const type = inferInventoryTierType({
        tierType: tier.tierType,
        layoutType: tier.layoutType,
        bundleItems: tier.bundleItems,
      })
      return type === "addon" || type === "bundle"
    })
  })

  const families = useMemo(
    () => listInventoryFamilies(tickets),
    [tickets],
  )
  const hasSellableRows = families.length > 0

  function resolveFamilyIndexes(family: InventoryFamily): number[] {
    const current = form.getValues("tickets") ?? []
    const refreshed = listInventoryFamilies(current).find(
      (candidate) => candidate.key === family.key,
    )
    return refreshed?.indexes ?? family.indexes
  }

  function openFamily(family: InventoryFamily, created = false) {
    if (family.kind === "map") {
      onSyncMapToTickets?.()
      const indexes = resolveFamilyIndexes(family)
      const current = form.getValues("tickets") ?? []
      setSheet({
        indexes,
        kind: "map",
        created,
        differentiate: sheetDifferentiateDefault(current, indexes),
        appendedIndexes: [],
      })
      return
    }

    const current = form.getValues("tickets") ?? []
    const dayIds = eventDates.map((day) => day.id)
    const plan = planMissingFamilyDayTickets({
      tickets: current,
      indexes: family.indexes,
      dayIds,
      isMultiDay,
    })
    const start = current.length
    const appendedIndexes: number[] = []
    if (plan.append.length > 0) {
      append(plan.append)
      for (let offset = 0; offset < plan.append.length; offset += 1) {
        appendedIndexes.push(start + offset)
      }
    }
    const indexes = [...plan.keepIndexes, ...appendedIndexes]
    const nextTickets = form.getValues("tickets") ?? []
    setSheet({
      indexes,
      kind: family.kind,
      created,
      differentiate: sheetDifferentiateDefault(nextTickets, indexes),
      appendedIndexes,
    })
  }

  function addGeneral() {
    const dayIds = eventDates.map((day) => day.id)
    const slots =
      isMultiDay && dayIds.length >= 2 ? dayIds : [dayIds[0] ?? null]
    const start = (form.getValues("tickets") ?? []).length
    const created = slots.map((dayId) =>
      createInventoryTicket("general", { dayId }),
    )
    append(created)
    setSheet({
      indexes: created.map((_, offset) => start + offset),
      kind: "general",
      created: true,
      differentiate: false,
      appendedIndexes: [],
    })
  }

  function commitSheetFamily() {
    if (!sheet) return
    const current = form.getValues("tickets") ?? []
    const primaryIndex = sheet.indexes[0]
    const primary = primaryIndex == null ? undefined : current[primaryIndex]
    if (!primary) return
    const name = (primary.name ?? "").trim()
    for (const index of sheet.indexes) {
      const ticket = current[index]
      if (!ticket) continue
      update(index, {
        ...ticket,
        name:
          sheet.kind === "map"
            ? ticket.name
            : name || ticket.name || "Entrada general",
        capacity: sheet.kind === "map" ? ticket.capacity : primary.capacity,
        price: sheet.differentiate ? ticket.price : primary.price,
        basePrice: sheet.differentiate ? ticket.basePrice : primary.price,
      })
    }
  }

  function closeSheet(open: boolean) {
    if (open) return
    if (sheet) {
      const current = form.getValues("tickets") ?? []
      const familyTickets = sheet.indexes
        .map((index) => current[index])
        .filter(Boolean)
      const stillBlank = familyTickets.every(
        (ticket) =>
          !ticket?.name?.trim() &&
          !(Number(ticket?.capacity) > 0) &&
          !(Number(ticket?.price) > 0),
      )
      if (sheet.created && stillBlank) {
        remove(sheet.indexes)
      } else if (!sheet.created && sheet.appendedIndexes.length > 0) {
        remove(sheet.appendedIndexes)
      } else {
        commitSheetFamily()
      }
    }
    setSheet(null)
  }

  function removeFamily(family: InventoryFamily) {
    if (family.sold > 0) return
    remove(family.indexes)
    if (sheet && family.indexes.some((index) => sheet.indexes.includes(index))) {
      setSheet(null)
    }
  }

  function removeMapFamily(family: InventoryFamily) {
    if (family.sold > 0) return
    if (family.seatingSectorId?.trim()) {
      onRemoveMapSector?.(family.seatingSectorId)
      return
    }
    removeFamily(family)
  }

  function handleMapToggle(checked: boolean) {
    if (checked) {
      form.setValue("basics.hasSeatingPlan", true, { shouldDirty: true })
      form.setValue("venue.includesSeatingMap", true, { shouldDirty: true })
      onOpenMapStudio?.()
      return
    }
    onDisableMap?.()
  }

  return (
    <div className="space-y-6" data-field="tickets">
      <FormLabel className={STUDIO_LABEL_CLASS} required>
        Entradas
      </FormLabel>
      <CapacityThermometer form={form} />
      {typeof form.formState.errors.tickets?.message === "string" ? (
        <FormMessage>{form.formState.errors.tickets.message}</FormMessage>
      ) : null}

      {hideMapBlock ? null : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/40 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Mapa de sectores</p>
            <p className="text-xs text-muted-foreground">
              Opcional. Podés vender solo con entradas generales.
            </p>
          </div>
          <Switch
            checked={mapEnabled}
            onCheckedChange={handleMapToggle}
            aria-label="Activar mapa de sectores"
          />
        </div>
      )}

      {hasSellableRows ? (
        <div className="space-y-2">
          {families.map((family) => (
            <InventorySummaryRow
              key={family.key}
              family={family}
              onEdit={() => openFamily(family)}
              onRemove={
                family.kind === "general"
                  ? () => removeFamily(family)
                  : () => removeMapFamily(family)
              }
            />
          ))}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={addGeneral}
              className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-foreground hover:border-emerald-500 dark:border-zinc-700"
            >
              <Plus className="size-3" aria-hidden="true" />
              Agregar Entrada General
            </button>
            {hideMapBlock ? null : (
              <button
                type="button"
                onClick={() => onOpenMapStudio?.()}
                className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-medium text-foreground hover:border-emerald-500 dark:border-zinc-700"
              >
                <Plus className="size-3" aria-hidden="true" />
                {families.some((family) => family.kind === "map")
                  ? "Editar mapa de sectores"
                  : "Configurar Mapa de Sectores"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-3 py-8 sm:flex-row">
          <ZeroStateButton
            icon={Ticket}
            label="Agregar Entrada General"
            onClick={addGeneral}
          />
          {hideMapBlock ? null : (
            <ZeroStateButton
              icon={Map}
              label="Configurar Mapa de Sectores"
              onClick={() => onOpenMapStudio?.()}
            />
          )}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowExtras((open) => !open)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-300"
          aria-expanded={showExtras}
        >
          <Plus className="mr-1 inline size-3" aria-hidden="true" />
          {showExtras
            ? "Ocultar herramientas de venta avanzadas"
            : "Mostrar herramientas de venta avanzadas"}
        </button>
        {showExtras ? (
          <div className="mt-4">
            <InventoryAdvancedTools
              form={form}
              appendTicket={append}
              updateTicket={update}
              removeTicket={remove}
              feePercentage={resolvedFeePercentage}
              fixedFee={fixedFee}
              isSponsored={isSponsored}
            />
          </div>
        ) : null}
      </div>

      {sheet ? (
        <TicketEditorSheet
          form={form}
          update={update}
          open
          onOpenChange={closeSheet}
          indexes={sheet.indexes}
          kind={sheet.kind}
          days={eventDates}
          isMultiDay={isMultiDay}
          differentiate={sheet.differentiate}
          onDifferentiateChange={(value) =>
            setSheet((current) =>
              current ? { ...current, differentiate: value } : current,
            )
          }
        />
      ) : null}
    </div>
  )
}

function ZeroStateButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Ticket
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-28 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-transparent px-4 py-6 text-sm text-muted-foreground transition dark:border-zinc-700",
        "hover:border-emerald-500 hover:text-foreground",
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Plus className="size-4" aria-hidden="true" />
        <Icon className="size-4" aria-hidden="true" />
      </span>
      {label}
    </button>
  )
}
