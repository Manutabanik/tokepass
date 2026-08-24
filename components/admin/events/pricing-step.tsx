"use client"

import { Map, Plus, Ticket } from "lucide-react"
import { useMemo, useState } from "react"
import type { UseFormReturn } from "react-hook-form"

import { CapacityThermometer } from "@/components/admin/events/capacity-thermometer"
import { InventoryAdvancedTools } from "@/components/admin/events/inventory-advanced-tools"
import { InventorySummaryRow } from "@/components/admin/events/inventory-summary-row"
import {
  sheetDifferentiateDefault,
  TicketEditorSheet,
} from "@/components/admin/events/ticket-editor-sheet"
import { FormLabel, FormMessage } from "@/components/ui/form"
import { listEventFormJornadas } from "@/lib/event-schedule"
import { EMPTY_MAP_ENABLE_ERROR } from "@/lib/inventory/map-enablement"
import {
  listInventoryFamilies,
  removeTicketFamily,
  upsertSyncedDayTickets,
  type InventoryFamily,
} from "@/lib/inventory/synced-day-tickets"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { STUDIO_LABEL_CLASS } from "@/lib/admin/studio-form-styles"
import type { EventFormValues } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

const EMPTY_FORM_TICKETS: EventFormValues["tickets"] = []

type SheetState = {
  indexes: number[]
  kind: "general" | "map"
  created: boolean
  differentiate: boolean
}

export function PricingStep({
  form,
  feePercentage = 15,
  fixedFee = 0,
  isSponsored = false,
  hideMapBlock = false,
  onOpenMapStudio,
}: {
  form: UseFormReturn<EventFormValues>
  eventId?: string | null
  feePercentage?: number
  fixedFee?: number
  isSponsored?: boolean
  hideMapBlock?: boolean
  onOpenMapStudio?: () => void
}) {
  const watchedTickets = form.watch("tickets")
  const tickets = form.getValues("tickets") ?? watchedTickets ?? EMPTY_FORM_TICKETS
  const scheduleDays = form.watch("basics.scheduleDays") ?? []
  const identityDate = form.watch("basics.date")
  const eventDates = listEventFormJornadas({
    scheduleDays,
    date: identityDate,
  })
  const isMultiDay =
    Boolean(form.watch("basics.isMultiDay")) || eventDates.length >= 2
  const mapError = form.formState.errors.venue?.venueMap?.message
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
  function openFamily(family: InventoryFamily, created = false) {
    const current = form.getValues("tickets") ?? []
    const dayIds = eventDates.map((day) => day.id)
    const covered =
      !isMultiDay ||
      dayIds.length < 2 ||
      dayIds.every((dayId) =>
        family.indexes.some(
          (index) => current[index]?.dayId === dayId,
        ),
      )
    const upserted = covered
      ? { tickets: current, indexes: family.indexes }
      : upsertSyncedDayTickets({
          tickets: current,
          dayIds,
          isMultiDay,
          indexes: family.indexes,
          name: family.name,
          capacity: current[family.indexes[0] ?? 0]?.capacity,
          basePrice: family.price,
          differentiate: sheetDifferentiateDefault(current, family.indexes),
          kind: family.kind,
          seatingSectorId: family.seatingSectorId,
        })
    if (upserted.tickets !== current) {
      form.setValue("tickets", upserted.tickets, { shouldDirty: true })
    }
    setSheet({
      indexes: upserted.indexes,
      kind: family.kind,
      created,
      differentiate: sheetDifferentiateDefault(
        upserted.tickets,
        upserted.indexes,
      ),
    })
  }

  function addGeneral() {
    const current = form.getValues("tickets") ?? []
    const next = upsertSyncedDayTickets({
      tickets: current,
      dayIds: eventDates.map((day) => day.id),
      isMultiDay,
      indexes: [],
      name: "",
      capacity: undefined,
      basePrice: 0,
      differentiate: false,
      kind: "general",
    })
    form.setValue("tickets", next.tickets, { shouldDirty: true })
    setSheet({
      indexes: next.indexes,
      kind: "general",
      created: true,
      differentiate: false,
    })
  }

  function closeSheet(open: boolean) {
    if (open) return
    if (sheet?.created) {
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
      if (stillBlank) {
        form.setValue("tickets", removeTicketFamily(current, sheet.indexes), {
          shouldDirty: true,
        })
      }
    }
    setSheet(null)
  }

  function removeFamily(family: InventoryFamily) {
    if (family.sold > 0) return
    form.setValue(
      "tickets",
      removeTicketFamily(form.getValues("tickets") ?? [], family.indexes),
      { shouldDirty: true },
    )
    if (sheet && family.indexes.some((index) => sheet.indexes.includes(index))) {
      setSheet(null)
    }
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
      {typeof mapError === "string" ? (
        <p className="text-sm text-destructive" role="alert">
          {mapError || EMPTY_MAP_ENABLE_ERROR}
        </p>
      ) : null}

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
                  : undefined
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
              feePercentage={feePercentage}
              fixedFee={fixedFee}
              isSponsored={isSponsored}
            />
          </div>
        ) : null}
      </div>

      {sheet ? (
        <TicketEditorSheet
          form={form}
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
