"use client"

import { Plus, Trash2 } from "lucide-react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import {
  createDraftLineItem,
  draftCapacityThermometer,
  draftNumberValue,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

const FIELD_CLASS =
  "h-10 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-white"

export function EventEditorV2InventoryStep() {
  const { control, register } = useFormContext<EventDraftV2>()
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const venueCapacity = useWatch({ control, name: "venueCapacity" })
  const meter = draftCapacityThermometer({ tickets, venueCapacity })

  return (
    <div className="space-y-8">
      <div className="grid max-w-xl gap-3">
        <Label
          htmlFor="event-v2-venue-capacity"
          className="text-sm font-bold text-slate-800 dark:text-zinc-200"
        >
          Aforo del recinto
        </Label>
        <Input
          id="event-v2-venue-capacity"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          className={FIELD_CLASS}
          {...register("venueCapacity", { setValueAs: draftNumberValue })}
        />
        <CapacityBar meter={meter} />
      </div>

      <DraftLineItemList
        name="tickets"
        title="Entradas generales"
        description="El stock de estas entradas alimenta el termómetro de aforo."
        addLabel="Agregar entrada"
        emptyLabel="Todavía no hay entradas generales."
      />

      <DraftLineItemList
        name="extras"
        title="Adicionales"
        description="Bebidas, merch u otros extras. No suman al aforo."
        addLabel="Agregar extra"
        emptyLabel="Todavía no hay adicionales."
      />
    </div>
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
  emptyLabel,
}: {
  name: "tickets" | "extras"
  title: string
  description: string
  addLabel: string
  emptyLabel: string
}) {
  const { control, register } = useFormContext<EventDraftV2>()
  const { fields, append, remove } = useFieldArray({
    control,
    name,
    keyName: "_rowId",
  })

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-200">
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(createDraftLineItem())}
        >
          <Plus className="size-4" />
          {addLabel}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-muted-foreground dark:border-zinc-800">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li
              key={field._rowId}
              className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <input type="hidden" {...register(`${name}.${index}.id`)} />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
                <div className="grid gap-1.5">
                  <Label
                    htmlFor={`event-v2-${name}-${index}-name`}
                    className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                  >
                    Nombre
                  </Label>
                  <Input
                    id={`event-v2-${name}-${index}-name`}
                    className={FIELD_CLASS}
                    placeholder={name === "tickets" ? "General" : "Cerveza"}
                    {...register(`${name}.${index}.name`)}
                  />
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
                    className={FIELD_CLASS}
                    {...register(`${name}.${index}.price`, {
                      setValueAs: draftNumberValue,
                    })}
                  />
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
                    className={FIELD_CLASS}
                    {...register(`${name}.${index}.stock`, {
                      setValueAs: draftNumberValue,
                    })}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${title.toLowerCase()} ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
