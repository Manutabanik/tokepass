"use client"

import { MapPinned, Package, Pencil, Plus, Ticket, Trash2, Users } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"

import { useDraftArchetype } from "./event-editor-v2-archetype"
import { DraftInventoryItemFields } from "./event-editor-v2-inventory-card"
import { EventEditorV2SeatingMap } from "./event-editor-v2-seating-map"
import {
  DRAFT_FIELD_CLASS,
  DraftAddButton,
  DraftFieldLabel,
  SplitRowSection,
} from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { createDraftLineItemsForScheduleDays } from "@/lib/events/draft-day-priced-tickets"
import {
  explicitDraftSlotCount,
  hasMultipleDraftSlots,
} from "@/lib/events/draft-schedule-slots-v2"
import {
  asTicketCommerceType,
  TICKET_COMMERCE_TYPE_LABELS,
} from "@/lib/events/ticket-commerce-type"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  createDraftLineItem,
  draftCapacityThermometer,
  draftNumberValue,
  isMapDraftTicket,
  resolveDraftHasMap,
  type EventDraftV2,
  type EventDraftV2LineItem,
} from "@/lib/validations/event-draft-v2"

type LineItemName = "tickets" | "extras"

type InventoryEditorTarget = {
  name: LineItemName
  index: number
  isNew: boolean
}

export function EventEditorV2InventoryStep({
  eventId,
  revealField = null,
  active = true,
}: {
  eventId: string
  revealField?: string | null
  active?: boolean
}) {
  const { control, register, setValue, getValues } =
    useFormContext<EventDraftV2>()
  const { labels } = useDraftArchetype()
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const extras = useWatch({ control, name: "extras" }) ?? []
  const venueCapacity = useWatch({ control, name: "venueCapacity" })
  const seatingMaps = useWatch({ control, name: "seatingMaps" })
  const seatingMap = useWatch({ control, name: "seatingMap" })
  const hasMapFlag = useWatch({ control, name: "hasMap" })
  const hasMap = resolveDraftHasMap({
    hasMap: hasMapFlag,
    seatingMaps,
    seatingMap,
  })
  const schedule = useWatch({ control, name: "schedule" }) ?? []
  const slotCount = explicitDraftSlotCount(schedule)
  const meter = draftCapacityThermometer({
    tickets,
    venueCapacity,
    schedule,
    slotCount: hasMultipleDraftSlots(schedule) ? slotCount : 1,
  })
  const ticketsLabel = labels.tickets
  const ticketArray = useFieldArray({
    control,
    name: "tickets",
    keyName: "_rowId",
    shouldUnregister: false,
  })
  const extraArray = useFieldArray({
    control,
    name: "extras",
    keyName: "_rowId",
    shouldUnregister: false,
  })
  const [editor, setEditor] = useState<InventoryEditorTarget | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const snapshotRef = useRef<EventDraftV2LineItem | null>(null)
  const closeIntentRef = useRef<"keep" | "discard">("discard")
  const editorRef = useRef<InventoryEditorTarget | null>(null)
  const revealKey = revealField?.trim() ?? ""
  const [lastRevealKey, setLastRevealKey] = useState(revealKey)
  const [lastActive, setLastActive] = useState(active)
  if (revealKey !== lastRevealKey) {
    setLastRevealKey(revealKey)
    const match = revealKey.match(/^(tickets|extras)\.(\d+)/)
    if (match) {
      const index = Number(match[2])
      if (Number.isFinite(index)) {
        setEditor({ name: match[1] as LineItemName, index, isNew: false })
      }
    }
  }
  if (active !== lastActive) {
    setLastActive(active)
    if (!active) {
      setEditor(null)
      setMapOpen(false)
    }
  }

  useLayoutEffect(() => {
    return () => {
      closeIntentRef.current = "keep"
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    editorRef.current = editor
    if (!editor) {
      snapshotRef.current = null
      return
    }
    const current = getValues(`${editor.name}.${editor.index}`)
    if (
      snapshotRef.current &&
      current &&
      snapshotRef.current.id &&
      snapshotRef.current.id === current.id
    ) {
      return
    }
    snapshotRef.current = current
      ? (structuredClone(current) as EventDraftV2LineItem)
      : null
  }, [editor, getValues])

  function openNew(name: LineItemName) {
    if (name === "extras") {
      const index = extraArray.fields.length
      extraArray.append(createDraftLineItem("extra"))
      setEditor({ name, index, isNew: true })
      return
    }
    const index = ticketArray.fields.length
    ticketArray.append(createDraftLineItemsForScheduleDays(schedule, "standard"))
    setEditor({ name, index, isNew: true })
  }

  function closeEditor() {
    setEditor(null)
  }

  function keepAndClose() {
    closeIntentRef.current = "keep"
    editorRef.current = null
    closeEditor()
  }

  function discardEditor() {
    if (closeIntentRef.current === "keep") {
      closeIntentRef.current = "discard"
      editorRef.current = null
      closeEditor()
      return
    }
    const current = editorRef.current
    if (!current) return
    editorRef.current = null
    if (current.isNew) {
      if (current.name === "tickets") ticketArray.remove(current.index)
      else extraArray.remove(current.index)
    } else if (snapshotRef.current) {
      setValue(`${current.name}.${current.index}`, snapshotRef.current, {
        shouldDirty: true,
        shouldTouch: true,
      })
    }
    closeEditor()
  }

  function saveEditor() {
    keepAndClose()
  }

  function removeRow(name: LineItemName, index: number) {
    const current = editorRef.current
    if (current?.name === name && current.index === index) {
      keepAndClose()
    } else if (current?.name === name && current.index > index) {
      const next = { ...current, index: current.index - 1 }
      editorRef.current = next
      setEditor(next)
    }
    if (name === "tickets") ticketArray.remove(index)
    else extraArray.remove(index)
  }

  const editorItem =
    editor == null ? null : getValues(`${editor.name}.${editor.index}`)
  const editorTitle =
    editor == null
      ? ""
      : editor.name === "tickets"
        ? editor.isNew
          ? `Nueva: ${ticketsLabel}`
          : `Editar ${ticketsLabel.toLowerCase()}`
        : editor.isNew
          ? "Nuevo adicional"
          : "Editar adicional"

  return (
    <div>
      <SplitRowSection
        title="Aforo del Recinto"
        description={`${labels.capacity}. El stock de ${ticketsLabel.toLowerCase()} alimenta el termómetro. Activá el mapa solo si vendés ubicaciones o mesas numeradas.`}
      >
        <div className="grid gap-1.5">
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

        {meter.overCapacity ? (
          <p
            role="status"
            className="rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs text-orange-400"
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

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-3 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapPinned className="size-4 shrink-0 text-emerald-400" aria-hidden />
              <Label
                htmlFor="event-v2-has-map"
                className="text-sm font-medium text-foreground"
              >
                ¿Tu evento tiene ubicaciones o mesas numeradas?
              </Label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Activalo para dibujar un mapa interactivo. Si solo vendés entradas
              generales, dejalo apagado.
            </p>
          </div>
          <Switch
            id="event-v2-has-map"
            checked={hasMap}
            onCheckedChange={(checked) => {
              setValue("hasMap", checked, { shouldDirty: true, shouldTouch: true })
              if (!checked) setMapOpen(false)
            }}
            className="mt-0.5 shrink-0 data-checked:bg-emerald-500"
            aria-label="Usar mapa interactivo"
          />
        </div>

        {hasMap ? (
          <Button
            type="button"
            className="h-12 min-h-12 w-full bg-emerald-500 font-semibold text-black hover:bg-emerald-400"
            onClick={() => setMapOpen(true)}
          >
            <MapPinned className="size-4" aria-hidden />
            Abrir Studio de Mapas
          </Button>
        ) : null}
      </SplitRowSection>

      <SplitRowSection
        title={ticketsLabel}
        description={`Lista compacta de ${ticketsLabel.toLowerCase()}. Editá cada ítem en el panel lateral.`}
      >
        <LineItemSummaryList
          name="tickets"
          items={tickets}
          hideMapTickets={hasMap}
          emptyTitle={`Aún no has creado ${ticketsLabel.toLowerCase()}`}
          emptyHint={`Armá el primer ítem de ${ticketsLabel.toLowerCase()} para definir el inventario.`}
          emptyIcon={Ticket}
          addLabel={`Agregar ${ticketsLabel.toLowerCase()}`}
          onAdd={() => openNew("tickets")}
          onEdit={(index) => setEditor({ name: "tickets", index, isNew: false })}
          onRemove={(index) => removeRow("tickets", index)}
        />
      </SplitRowSection>

      <SplitRowSection
        title="Adicionales y Tienda"
        description={`Bebidas, merch u otros extras. No suman a ${labels.capacity.toLowerCase()}.`}
        className="mb-0 border-b-0 pb-0"
      >
        <LineItemSummaryList
          name="extras"
          items={extras}
          hideMapTickets={false}
          emptyTitle="Aún no has creado adicionales"
          emptyHint={`Sumá un extra cuando quieras vender algo además de ${ticketsLabel.toLowerCase()}.`}
          emptyIcon={Package}
          addLabel="Agregar extra"
          onAdd={() => openNew("extras")}
          onEdit={(index) => setEditor({ name: "extras", index, isNew: false })}
          onRemove={(index) => removeRow("extras", index)}
        />
      </SplitRowSection>

      <Sheet
        open={active && editor != null}
        onOpenChange={(open) => {
          if (!open && active) discardEditor()
        }}
      >
        <SheetContent
          side="right"
          className="w-[400px] gap-0 p-0 sm:w-[540px]"
        >
          <SheetHeader className="text-left">
            <SheetTitle>{editorTitle}</SheetTitle>
            <SheetDescription>
              Los cambios se escriben en el borrador. Guardá para cerrar o
              cancelá para volver atrás.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {editor && editorItem ? (
              <DraftInventoryItemFields
                name={editor.name}
                index={editor.index}
              />
            ) : null}
          </div>
          <SheetFooter className="flex-row justify-between gap-2 sm:justify-between">
            {editor ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => removeRow(editor.name, editor.index)}
              >
                <Trash2 className="size-4" aria-hidden />
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={discardEditor}>
                Cancelar
              </Button>
              <Button type="button" onClick={saveEditor}>
                Guardar
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={active && mapOpen}
        onOpenChange={(open) => {
          if (!open) setMapOpen(false)
        }}
      >
        <SheetContent
          side="right"
          className="w-full max-w-full overflow-x-hidden gap-0 p-0 sm:max-w-md md:max-w-xl"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Studio de Mapas</SheetTitle>
            <SheetDescription>
              Cada jornada puede tener su plano. El editor se abre a pantalla
              completa.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
            {hasMap ? (
              <EventEditorV2SeatingMap eventId={eventId} embedded />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function LineItemSummaryList({
  name,
  items,
  hideMapTickets,
  emptyTitle,
  emptyHint,
  emptyIcon: EmptyIcon,
  addLabel,
  onAdd,
  onEdit,
  onRemove,
}: {
  name: LineItemName
  items: EventDraftV2LineItem[]
  hideMapTickets: boolean
  emptyTitle: string
  emptyHint: string
  emptyIcon: typeof Ticket
  addLabel: string
  onAdd: () => void
  onEdit: (index: number) => void
  onRemove: (index: number) => void
}) {
  const visible = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        name === "extras" || !hideMapTickets || !isMapDraftTicket(item),
    )

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-transparent px-4 py-8 text-center dark:border-gray-700">
        <EmptyIcon className="size-8 text-gray-400" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-foreground">{emptyTitle}</p>
        <p className="mt-1 max-w-sm text-sm text-gray-500">{emptyHint}</p>
        <div className="mt-4 w-full max-w-xs">
          <DraftAddButton onClick={onAdd}>
            <Plus className="size-4" />
            {addLabel}
          </DraftAddButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border/60">
        <table className="w-full table-auto text-left text-sm">
          <thead className="hidden border-b border-border/60 bg-muted/40 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:table-header-group">
            <tr>
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">Tipo de acceso</th>
              <th className="px-3 py-2 font-semibold">Precio</th>
              <th className="px-3 py-2 font-semibold">Stock</th>
              <th className="px-3 py-2 text-right font-semibold">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ item, index }) => {
              const label = item.name?.trim() || (name === "tickets" ? "Entrada" : "Extra")
              const typeLabel =
                TICKET_COMMERCE_TYPE_LABELS[asTicketCommerceType(item.ticketType)]
              return (
                <tr
                  key={item.id || `${name}-${index}`}
                  className="border-b border-border/40 last:border-b-0"
                >
                  <td className="px-3 py-3 align-middle">
                    <p className="font-medium text-foreground">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                      {typeLabel} · {formatCurrency(draftNumberValue(item.price))} ·{" "}
                      {formatNumber(draftNumberValue(item.stock))}
                    </p>
                  </td>
                  <td className="hidden px-3 py-3 align-middle text-muted-foreground sm:table-cell">
                    {typeLabel}
                  </td>
                  <td className="hidden px-3 py-3 align-middle tabular-nums sm:table-cell">
                    {formatCurrency(draftNumberValue(item.price))}
                  </td>
                  <td className="hidden px-3 py-3 align-middle tabular-nums sm:table-cell">
                    {formatNumber(draftNumberValue(item.stock))}
                  </td>
                  <td className="px-2 py-2 text-right align-middle">
                    <div className="inline-flex items-center justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10"
                        aria-label={`Editar ${label}`}
                        onClick={() => onEdit(index)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 text-muted-foreground hover:text-red-500"
                        aria-label={`Eliminar ${label}`}
                        onClick={() => onRemove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <DraftAddButton onClick={onAdd}>
        <Plus className="size-4" />
        {addLabel}
      </DraftAddButton>
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
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
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
