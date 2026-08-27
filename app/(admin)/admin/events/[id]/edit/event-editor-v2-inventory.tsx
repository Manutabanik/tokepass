"use client"

import { Package, Plus, Ticket, Users } from "lucide-react"
import { useLayoutEffect, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"

import { useDraftArchetype } from "./event-editor-v2-archetype"
import { DraftInventoryAccordionCard } from "./event-editor-v2-inventory-card"
import { InventorySummaryTable } from "./event-editor-v2-inventory-table"
import { EventEditorV2SeatingMap } from "./event-editor-v2-seating-map"
import {
  BENTO_INVENTORY_GRID_CLASS,
  DRAFT_FIELD_CLASS,
  DraftAddButton,
  DraftFieldLabel,
  SUPER_PANEL_ITEM_CLASS,
} from "./event-editor-v2-ui"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  explicitDraftSlotCount,
  hasMultipleDraftSlots,
} from "@/lib/events/draft-schedule-slots-v2"
import { createDraftLineItemsForScheduleDays } from "@/lib/events/draft-day-priced-tickets"
import {
  inventoryExtrasErrorsOpenPanel,
  inventorySuperPanelForFieldPath,
  resolveInventorySuperPanel,
  type InventorySuperPanelId,
} from "@/lib/events/editor-v2-inventory-panels"
import {
  createDraftLineItem,
  draftCapacityThermometer,
  draftNumberValue,
  isMapDraftTicket,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function EventEditorV2InventoryStep({
  eventId,
  revealField = null,
}: {
  eventId: string
  revealField?: string | null
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const { labels } = useDraftArchetype()
  const tickets = useWatch({ name: "tickets" }) ?? []
  const extras = useWatch({ name: "extras" }) ?? []
  const venueCapacity = useWatch({ name: "venueCapacity" })
  const schedule = useWatch({ name: "schedule" }) ?? []
  const slotCount = explicitDraftSlotCount(schedule)
  const meter = draftCapacityThermometer({
    tickets,
    venueCapacity,
    schedule,
    slotCount: hasMultipleDraftSlots(schedule) ? slotCount : 1,
  })
  const ticketsLabel = labels.tickets
  const extrasCount = extras.length
  const [openPanel, setOpenPanel] = useState<InventorySuperPanelId[]>(() => [
    resolveInventorySuperPanel(errors, revealField),
  ])
  const extrasErrors = inventoryExtrasErrorsOpenPanel(errors)

  useLayoutEffect(() => {
    if (revealField?.trim()) {
      setOpenPanel([inventorySuperPanelForFieldPath(revealField)])
      return
    }
    if (extrasErrors) {
      setOpenPanel(["extras"])
    }
  }, [extrasErrors, revealField])

  return (
    <div className={cn(BENTO_INVENTORY_GRID_CLASS, "flex w-full flex-col")}>
      <section className="flex w-full flex-col gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 shadow-sm md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-2 md:w-auto">
          <Users className="size-4 shrink-0 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            {labels.capacity}
          </h2>
        </div>
        <div className="grid min-w-0 w-full gap-1.5 md:max-w-[13rem]">
          <DraftFieldLabel
            htmlFor="event-v2-venue-capacity"
            required
            className="text-sm"
          >
            ¿Cuánta gente entra?
          </DraftFieldLabel>
          <Input
            id="event-v2-venue-capacity"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className={cn(DRAFT_FIELD_CLASS, "h-11 min-h-11")}
            {...register("venueCapacity", { setValueAs: draftNumberValue })}
          />
        </div>
        <div className="min-w-0 flex-1">
          {meter.overCapacity ? (
            <p
              role="status"
              className="mb-2 rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs text-orange-400"
            >
              Atención: El stock de tus {ticketsLabel.toLowerCase()} supera{" "}
              {labels.capacity.toLowerCase()}
            </p>
          ) : null}
          <CapacityBar
            meter={meter}
            capacityLabel={labels.capacity}
            ticketsLabel={ticketsLabel}
          />
        </div>
      </section>

      <Accordion
        type="single"
        collapsible
        keepMounted
        value={openPanel}
        onValueChange={(next) => {
          const panel = next[0]
          setOpenPanel(panel === "tickets" || panel === "extras" ? [panel] : [])
        }}
        className="w-full"
      >
        <AccordionItem value="tickets" className={SUPER_PANEL_ITEM_CLASS}>
          <AccordionTrigger className="px-1 py-4 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-3 text-left">
              <Ticket className="size-4 shrink-0 text-emerald-400" aria-hidden />
              <span className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                Aforo y Entradas • {formatNumber(meter.used)} configurados
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-4">
            <DraftLineItemList
              embedded
              name="tickets"
              title={ticketsLabel}
              description={`El stock de ${ticketsLabel.toLowerCase()} alimenta el termómetro de ${labels.capacity.toLowerCase()}.`}
              addLabel={`Agregar ${ticketsLabel.toLowerCase()}`}
              emptyTitle={`Aún no has creado ${ticketsLabel.toLowerCase()}`}
              emptyHint={`Armá el primer ítem de ${ticketsLabel.toLowerCase()} para empezar a definir el inventario.`}
              emptyIcon={Ticket}
              emptyItemTitle={`Nuevo: ${ticketsLabel}`}
            />
            <EventEditorV2SeatingMap eventId={eventId} embedded />
            <InventorySummaryTable embedded />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="extras" className={SUPER_PANEL_ITEM_CLASS}>
          <AccordionTrigger className="px-1 py-4 hover:no-underline">
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-3 text-left">
              <Package className="size-4 shrink-0 text-emerald-400" aria-hidden />
              <span className="truncate text-sm font-bold text-slate-800 dark:text-zinc-100">
                Adicionales y Tienda
                {extrasCount > 0 ? ` • ${formatNumber(extrasCount)}` : ""}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-4">
            <DraftLineItemList
              embedded
              name="extras"
              title="Adicionales"
              description={`Bebidas, merch u otros extras. No suman a ${labels.capacity.toLowerCase()}.`}
              addLabel="Agregar extra"
              emptyTitle="Aún no has creado adicionales"
              emptyHint={`Sumá un extra cuando quieras vender algo además de ${ticketsLabel.toLowerCase()}.`}
              emptyIcon={Package}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

function CapacityBar({
  meter,
  capacityLabel,
  ticketsLabel,
}: {
  meter: ReturnType<typeof draftCapacityThermometer>
  capacityLabel: string
  ticketsLabel: string
}) {
  const totalLabel = meter.capacity > 0 ? formatNumber(meter.capacity) : "—"

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>
          Ocupación de {capacityLabel.toLowerCase()}
          {meter.slotCount > 1
            ? ` · ${meter.perSession || 0} × ${meter.slotCount} turnos`
            : ""}
        </span>
        <span className="font-medium tabular-nums text-foreground">
          {formatNumber(meter.used)} / {totalLabel}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={meter.capacity || meter.used}
        aria-valuenow={meter.used}
        aria-label={`Stock de ${ticketsLabel.toLowerCase()} sobre ${capacityLabel.toLowerCase()}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color]",
            meter.overCapacity
              ? "bg-amber-500"
              : meter.remaining > 0
                ? "bg-emerald-600 dark:bg-emerald-400"
                : "bg-zinc-700 dark:bg-zinc-300",
          )}
          style={{ width: `${meter.capacity > 0 ? meter.percent : 0}%` }}
        />
      </div>
      {meter.overCapacity ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          El stock de {ticketsLabel.toLowerCase()} supera{" "}
          {capacityLabel.toLowerCase()} por {formatNumber(meter.overflow)}{" "}
          lugares.
        </p>
      ) : meter.capacity > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {capacityLabel} disponible: {formatNumber(meter.remaining)} lugares
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Definí {capacityLabel.toLowerCase()} para ver la ocupación en tiempo
          real.
        </p>
      )}
    </section>
  )
}

function DraftLineItemList({
  name,
  title,
  description,
  addLabel,
  emptyTitle,
  emptyHint,
  emptyIcon: EmptyIcon,
  emptyItemTitle,
  embedded = false,
}: {
  name: "tickets" | "extras"
  title: string
  description: string
  addLabel: string
  emptyTitle: string
  emptyHint: string
  emptyIcon: typeof Ticket
  emptyItemTitle?: string
  embedded?: boolean
}) {
  const { control, register } = useFormContext<EventDraftV2>()
  const schedule = useWatch({ control, name: "schedule" }) ?? []
  const { fields, append, remove } = useFieldArray({
    control,
    name,
    keyName: "_rowId",
  })

  function addItem() {
    if (name === "extras") {
      append(createDraftLineItem("extra"))
      return
    }
    append(createDraftLineItemsForScheduleDays(schedule, "standard"))
  }

  const visibleCount =
    name === "tickets"
      ? fields.filter((field) => !isMapDraftTicket(field)).length
      : fields.length

  return (
    <section className={cn("w-full space-y-3", !embedded && "space-y-4")}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-200">
          {name === "tickets" ? (
            <Ticket className="size-4 text-emerald-400" aria-hidden />
          ) : (
            <Package className="size-4 text-emerald-400" aria-hidden />
          )}
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {visibleCount === 0 ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-transparent px-4 text-center dark:border-gray-700",
            embedded ? "py-8" : "py-12",
          )}
        >
          <EmptyIcon className="size-8 text-gray-400" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-foreground">{emptyTitle}</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">{emptyHint}</p>
          <div className="mt-4 w-full max-w-xs">
            <DraftAddButton onClick={addItem}>
              <Plus className="size-4" />
              {addLabel}
            </DraftAddButton>
          </div>
        </div>
      ) : null}

      {fields.length > 0 ? (
        <ul className={visibleCount === 0 ? "hidden" : "w-full space-y-2"}>
          {fields.map((field, index) => {
            if (name === "tickets" && isMapDraftTicket(field)) {
              return (
                <li key={field._rowId} className="hidden">
                  <input type="hidden" {...register(`${name}.${index}.id`)} />
                  <input type="hidden" {...register(`${name}.${index}.name`)} />
                  <input type="hidden" {...register(`${name}.${index}.description`)} />
                  <input type="hidden" {...register(`${name}.${index}.price`)} />
                  <input type="hidden" {...register(`${name}.${index}.stock`)} />
                  <input type="hidden" {...register(`${name}.${index}.minOrder`)} />
                  <input type="hidden" {...register(`${name}.${index}.maxOrder`)} />
                  <input type="hidden" {...register(`${name}.${index}.source`)} />
                  <input type="hidden" {...register(`${name}.${index}.sectorId`)} />
                  <input type="hidden" {...register(`${name}.${index}.layoutType`)} />
                  <input type="hidden" {...register(`${name}.${index}.startDate`)} />
                  <input type="hidden" {...register(`${name}.${index}.endDate`)} />
                  <input type="hidden" {...register(`${name}.${index}.slotId`)} />
                  <input type="hidden" {...register(`${name}.${index}.ticketType`)} />
                </li>
              )
            }
            return (
              <DraftInventoryAccordionCard
                key={field._rowId}
                name={name}
                index={index}
                initialName={field.name}
                initialStartDate={field.startDate}
                initialEndDate={field.endDate}
                emptyTitle={
                  emptyItemTitle ??
                  (name === "tickets" ? "Nueva Entrada" : "Nuevo adicional")
                }
                onRemove={() => remove(index)}
              />
            )
          })}
        </ul>
      ) : null}

      {visibleCount > 0 ? (
        <DraftAddButton onClick={addItem}>
          <Plus className="size-4" />
          {addLabel}
        </DraftAddButton>
      ) : null}
    </section>
  )
}
