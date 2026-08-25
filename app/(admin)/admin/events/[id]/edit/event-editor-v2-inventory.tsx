"use client"

import { MapPinned, Package, Plus, Ticket, Trash2, Users } from "lucide-react"
import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"

import {
  DRAFT_FIELD_CLASS,
  DRAFT_TEXTAREA_CLASS,
  DRAFT_TICKET_CARD_CLASS,
  DraftAddButton,
  DraftCard,
  DraftFieldError,
  DraftHint,
} from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  createDraftLineItem,
  draftCapacityThermometer,
  draftNumberValue,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

export function EventEditorV2InventoryStep() {
  const { register } = useFormContext<EventDraftV2>()
  const tickets = useWatch({ name: "tickets" }) ?? []
  const venueCapacity = useWatch({ name: "venueCapacity" })
  const meter = draftCapacityThermometer({ tickets, venueCapacity })

  return (
    <div className="space-y-6">
      <DraftCard>
        <div className="mb-4 flex items-center gap-2">
          <Users className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Aforo del recinto
          </h2>
        </div>
        <div className="grid max-w-xl gap-3">
          <Label
            htmlFor="event-v2-venue-capacity"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Capacidad del recinto
          </Label>
          <Input
            id="event-v2-venue-capacity"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className={DRAFT_FIELD_CLASS}
            {...register("venueCapacity", { setValueAs: draftNumberValue })}
          />
          <DraftHint>
            Este número define el tope máximo del termómetro. Los extras no ocupan
            lugar.
          </DraftHint>
          {meter.overCapacity ? (
            <p
              role="status"
              className="rounded-lg bg-orange-500/10 px-3 py-2 text-sm text-orange-400"
            >
              Atención: El stock de tus entradas supera la capacidad del recinto
            </p>
          ) : null}
          <CapacityBar meter={meter} />
        </div>
      </DraftCard>

      <SeatingMapPlaceholder />

      <DraftLineItemList
        name="tickets"
        title="Entradas generales"
        description="El stock de estas entradas alimenta el termómetro de aforo."
        addLabel="Agregar entrada"
        emptyTitle="Aún no has creado entradas"
        emptyHint="Armá la primera entrada general para empezar a definir el inventario."
        emptyIcon={Ticket}
      />

      <DraftLineItemList
        name="extras"
        title="Adicionales"
        description="Bebidas, merch u otros extras. No suman al aforo."
        addLabel="Agregar extra"
        emptyTitle="Aún no has creado adicionales"
        emptyHint="Sumá un extra cuando quieras vender algo además de la entrada."
        emptyIcon={Package}
      />
    </div>
  )
}

function SeatingMapPlaceholder() {
  const [open, setOpen] = useState(false)
  const seatingMap = useWatch({ name: "seatingMap" })
  const sectorCount = seatingMap?.sectors?.length ?? 0

  return (
    <DraftCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-100">
            <MapPinned className="size-4 text-emerald-400" aria-hidden />
            Mapa de asientos
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Opcional. La estructura vive en el JSON, no en tablas relacionales.
            {sectorCount > 0
              ? ` ${sectorCount} sector${sectorCount === 1 ? "" : "es"} en el borrador.`
              : ""}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Configurar Mapa (Opcional)
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mapa de asientos</DialogTitle>
            <DialogDescription>
              El editor de mapa llega en un próximo paso. El campo{" "}
              <code>seatingMap</code> ya forma parte de <code>draft_state</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </DraftCard>
  )
}

function CapacityBar({
  meter,
}: {
  meter: ReturnType<typeof draftCapacityThermometer>
}) {
  const totalLabel = meter.capacity > 0 ? formatNumber(meter.capacity) : "—"

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <span>Ocupación de aforo</span>
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
        aria-label="Stock de entradas sobre aforo del recinto"
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
          El stock de entradas supera el aforo por {formatNumber(meter.overflow)}{" "}
          lugares.
        </p>
      ) : meter.capacity > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Aforo disponible: {formatNumber(meter.remaining)} lugares
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Definí el aforo para ver la ocupación en tiempo real.
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
}: {
  name: "tickets" | "extras"
  title: string
  description: string
  addLabel: string
  emptyTitle: string
  emptyHint: string
  emptyIcon: typeof Ticket
}) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()
  const { fields, append, remove } = useFieldArray({
    control,
    name,
    keyName: "_rowId",
  })

  function addItem() {
    append(createDraftLineItem())
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-zinc-200">
            {name === "tickets" ? (
              <Ticket className="size-4 text-emerald-400" aria-hidden />
            ) : (
              <Package className="size-4 text-emerald-400" aria-hidden />
            )}
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/40 px-6 py-12 text-center transition-all duration-200 dark:border-gray-700 dark:bg-gray-950/40">
          <EmptyIcon className="size-10 text-gray-400" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-foreground">{emptyTitle}</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">{emptyHint}</p>
          <div className="mt-5 w-full max-w-xs">
            <DraftAddButton onClick={addItem}>
              <Plus className="size-4" />
              {addLabel}
            </DraftAddButton>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {fields.map((field, index) => {
            const itemErrors = errors[name]?.[index]
            return (
              <li key={field._rowId} className={DRAFT_TICKET_CARD_CLASS}>
                <input type="hidden" {...register(`${name}.${index}.id`)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 text-muted-foreground hover:text-red-500"
                  aria-label={`Eliminar ${title.toLowerCase()} ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4" />
                </Button>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_8rem_8rem]">
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={`event-v2-${name}-${index}-name`}
                      className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                    >
                      Nombre
                    </Label>
                    <Input
                      id={`event-v2-${name}-${index}-name`}
                      className={DRAFT_FIELD_CLASS}
                      placeholder={name === "tickets" ? "General" : "Cerveza"}
                      {...register(`${name}.${index}.name`)}
                    />
                    <DraftFieldError message={itemErrors?.name?.message} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={`event-v2-${name}-${index}-price`}
                      className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                    >
                      Precio
                    </Label>
                    <Input
                      id={`event-v2-${name}-${index}-price`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.price`, {
                        setValueAs: draftNumberValue,
                      })}
                    />
                    <DraftFieldError message={itemErrors?.price?.message} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={`event-v2-${name}-${index}-stock`}
                      className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                    >
                      Stock
                    </Label>
                    <Input
                      id={`event-v2-${name}-${index}-stock`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.stock`, {
                        setValueAs: draftNumberValue,
                      })}
                    />
                    <DraftFieldError message={itemErrors?.stock?.message} />
                  </div>
                </div>

                <div className="mt-3 grid gap-1.5">
                  <Label
                    htmlFor={`event-v2-${name}-${index}-description`}
                    className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                  >
                    Descripción breve
                  </Label>
                  <Textarea
                    id={`event-v2-${name}-${index}-description`}
                    rows={2}
                    className={DRAFT_TEXTAREA_CLASS}
                    placeholder="Qué incluye o cómo se usa."
                    {...register(`${name}.${index}.description`)}
                  />
                  <DraftHint>Una línea alcanza. El comprador lo ve en el checkout.</DraftHint>
                  <DraftFieldError message={itemErrors?.description?.message} />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={`event-v2-${name}-${index}-min`}
                      className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                    >
                      Mínimo por persona
                    </Label>
                    <Input
                      id={`event-v2-${name}-${index}-min`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.minOrder`, {
                        setValueAs: (value) => draftNumberValue(value, 1),
                      })}
                    />
                    <DraftHint>Mínimo que puede llevar cada persona.</DraftHint>
                    <DraftFieldError message={itemErrors?.minOrder?.message} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label
                      htmlFor={`event-v2-${name}-${index}-max`}
                      className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                    >
                      Máximo por persona
                    </Label>
                    <Input
                      id={`event-v2-${name}-${index}-max`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      className={DRAFT_FIELD_CLASS}
                      {...register(`${name}.${index}.maxOrder`, {
                        setValueAs: (value) => draftNumberValue(value, 10),
                      })}
                    />
                    <DraftHint>Tope por compra. Evita acaparamientos.</DraftHint>
                    <DraftFieldError message={itemErrors?.maxOrder?.message} />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {fields.length > 0 ? (
        <DraftAddButton onClick={addItem}>
          <Plus className="size-4" />
          {addLabel}
        </DraftAddButton>
      ) : null}
    </section>
  )
}
