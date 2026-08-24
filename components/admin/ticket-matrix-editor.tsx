"use client"

import { Copy, Percent, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

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
import { PriceInput } from "@/components/ui/price-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
  STUDIO_SELECT_CONTENT_CLASS,
} from "@/lib/admin/studio-form-styles"
import { formatInventoryDayOption } from "@/lib/event-schedule"
import { parseStrictInt } from "@/lib/inventory/capacity-budget"
import {
  scheduleDayMissingTicketsMessage,
  uncoveredScheduleDays,
} from "@/lib/inventory/day-ticket-coverage"
import {
  applyTicketMatrixDayVariation,
  buildTicketPriceMatrix,
  copyTicketMatrixDay,
  isMatrixPassTicket,
  isMatrixRowTicket,
  matrixTicketNameKey,
  nextMatrixPassName,
  nextMatrixTypeName,
  type DayPriceVariation,
  type TicketMatrixDay,
} from "@/lib/inventory/ticket-price-matrix"
import { cn } from "@/lib/utils"
import type { EventFormValues } from "@/lib/validations/event-form"

type TicketRow = EventFormValues["tickets"][number]

function blankMatrixTicket(name: string, dayId: string | null): TicketRow {
  return {
    isNew: true,
    name,
    price: 0,
    basePrice: undefined,
    feeStrategy: "pass_to_customer",
    calculationMode: "net_income",
    capacity: 1,
    timeLimit: "",
    bonusReward: "",
    dayId,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    minPurchaseLimit: 1,
    maxPurchaseLimit: null,
    admitCount: 1,
    tierType: "general",
    listPrice: null,
    bundleItems: [],
    bundleType: null,
    promoDiscountType: null,
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

function cloneForDay(source: TicketRow, targetDayId: string): TicketRow {
  return {
    ...source,
    id: undefined,
    isNew: true,
    sold: 0,
    dayId: targetDayId,
    visibility: "public",
    phases: (source.phases ?? []).map((phase) => ({
      ...phase,
      id: undefined,
      sold: 0,
    })),
  }
}

const cellControlClass = cn(STUDIO_CONTROL_CLASS, "h-9 px-3 text-sm")
const EMPTY_MATRIX_TICKETS: EventFormValues["tickets"] = []

export function TicketMatrixEditor({
  form,
  days,
}: {
  form: UseFormReturn<EventFormValues>
  days: TicketMatrixDay[]
}) {
  const tickets = form.watch("tickets") ?? EMPTY_MATRIX_TICKETS
  const [variationOpen, setVariationOpen] = useState(false)
  const [variationDayId, setVariationDayId] = useState(days[1]?.id ?? days[0]?.id ?? "")
  const [variationKind, setVariationKind] = useState<DayPriceVariation["kind"]>(
    "amount",
  )
  const [variationValue, setVariationValue] = useState("5000")

  const rows = useMemo(
    () => buildTicketPriceMatrix(tickets, days),
    [days, tickets],
  )
  const passes = useMemo(
    () =>
      tickets
        .map((ticket, index) => ({ ticket, index }))
        .filter((item) => isMatrixPassTicket(item.ticket)),
    [tickets],
  )
  const uncovered = useMemo(
    () => uncoveredScheduleDays(days, tickets),
    [days, tickets],
  )
  const uncoveredIds = new Set(uncovered.map((day) => day.id))
  const firstDayLabel = days[0]
    ? formatInventoryDayOption(days[0], 0)
    : "Día 1"

  function commit(next: TicketRow[]) {
    form.setValue("tickets", next, { shouldDirty: true, shouldValidate: true })
  }

  function patchTicket(index: number, patch: Partial<TicketRow>) {
    commit(
      tickets.map((ticket, current) =>
        current === index ? { ...ticket, ...patch } : ticket,
      ),
    )
  }

  function addType() {
    const name = nextMatrixTypeName(tickets)
    const dayId = days[0]?.id
    if (!dayId) return
    commit([...tickets, blankMatrixTicket(name, dayId)])
  }

  function renameRow(nameKey: string, nextName: string) {
    const trimmed = nextName.trim() || "General"
    commit(
      tickets.map((ticket) =>
        isMatrixRowTicket(ticket) && matrixTicketNameKey(ticket.name) === nameKey
          ? { ...ticket, name: trimmed }
          : ticket,
      ),
    )
  }

  function removeRow(nameKey: string) {
    const family = tickets.filter(
      (ticket) =>
        isMatrixRowTicket(ticket) && matrixTicketNameKey(ticket.name) === nameKey,
    )
    if (family.some((ticket) => (ticket.sold ?? 0) > 0)) {
      toast.error("Hay ventas en esta tarifa. Deshabilitala por día en lugar de borrarla.")
      commit(
        tickets.map((ticket) =>
          isMatrixRowTicket(ticket) &&
          matrixTicketNameKey(ticket.name) === nameKey
            ? { ...ticket, visibility: "private" }
            : ticket,
        ),
      )
      return
    }
    commit(
      tickets.filter(
        (ticket) =>
          !(
            isMatrixRowTicket(ticket) &&
            matrixTicketNameKey(ticket.name) === nameKey
          ),
      ),
    )
  }

  function setCellEnabled(nameKey: string, dayId: string, enabled: boolean) {
    const row = rows.find((item) => item.nameKey === nameKey)
    const cell = row?.cells[dayId]
    if (cell?.index != null) {
      patchTicket(cell.index, { visibility: enabled ? "public" : "private" })
      return
    }
    if (!enabled) return
    const templateIndex = Object.values(row?.cells ?? {}).find(
      (item) => item.index != null,
    )?.index
    const template =
      templateIndex != null ? tickets[templateIndex] : undefined
    commit([
      ...tickets,
      template
        ? cloneForDay(template, dayId)
        : blankMatrixTicket(row?.name || "General", dayId),
    ])
  }

  function setCellPrice(nameKey: string, dayId: string, price: number | undefined) {
    const row = rows.find((item) => item.nameKey === nameKey)
    const cell = row?.cells[dayId]
    if (cell?.index != null) {
      patchTicket(cell.index, { price: price ?? 0 })
      return
    }
    if (price == null) return
    setCellEnabled(nameKey, dayId, true)
    const latest = form.getValues("tickets") ?? []
    const latestRows = buildTicketPriceMatrix(latest, days)
    const nextIndex = latestRows.find((item) => item.nameKey === nameKey)?.cells[
      dayId
    ]?.index
    if (nextIndex == null) return
    const next = latest.map((ticket, index) =>
      index === nextIndex ? { ...ticket, price, visibility: "public" as const } : ticket,
    )
    commit(next)
  }

  function setCellStock(nameKey: string, dayId: string, raw: string) {
    const parsed = parseStrictInt(raw)
    const capacity =
      typeof parsed === "number" && !Number.isNaN(parsed) ? parsed : 0
    const row = rows.find((item) => item.nameKey === nameKey)
    const cell = row?.cells[dayId]
    if (cell?.index != null) {
      patchTicket(cell.index, { capacity })
      return
    }
    setCellEnabled(nameKey, dayId, true)
    const latest = form.getValues("tickets") ?? []
    const latestRows = buildTicketPriceMatrix(latest, days)
    const nextIndex = latestRows.find((item) => item.nameKey === nameKey)?.cells[
      dayId
    ]?.index
    if (nextIndex == null) return
    commit(
      latest.map((ticket, index) =>
        index === nextIndex
          ? { ...ticket, capacity, visibility: "public" as const }
          : ticket,
      ),
    )
  }

  function copyFirstDay() {
    const sourceId = days[0]?.id
    if (!sourceId) return
    commit(copyTicketMatrixDay(tickets, days, sourceId, cloneForDay))
    toast.success(`Se copió ${firstDayLabel} a todos los días.`)
  }

  function applyVariation() {
    const value = Number(variationValue.replace(",", "."))
    if (!Number.isFinite(value) || !variationDayId) {
      toast.error("Indicá un valor válido para la variación.")
      return
    }
    commit(
      applyTicketMatrixDayVariation(tickets, variationDayId, {
        kind: variationKind,
        value,
      }),
    )
    setVariationOpen(false)
    toast.success("Se actualizaron los precios de ese día.")
  }

  function addPass() {
    const name = nextMatrixPassName(
      tickets,
      days.length > 1 ? `Abono ${days.length} días` : "Abono completo",
    )
    commit([
      ...tickets,
      {
        ...blankMatrixTicket(name, null),
        tierType: "bundle",
        bundleType: "multi_day_pass",
      },
    ])
  }

  function removePass(index: number) {
    const ticket = tickets[index]
    if ((ticket?.sold ?? 0) > 0) {
      toast.error("Ese abono ya tiene ventas. Deshabilitalo en visibilidad.")
      patchTicket(index, { visibility: "private" })
      return
    }
    commit(tickets.filter((_, current) => current !== index))
  }

  if (days.length < 2) return null

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Matriz de precios por día
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Definí cada tipo una sola vez. Precio y cupo se editan por jornada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={copyFirstDay}
            className="gap-1.5 border-slate-200 text-xs text-muted-foreground hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
          >
            <Copy className="size-3.5" aria-hidden="true" />
            Copiar {firstDayLabel} a todos los días
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setVariationOpen(true)}
            className="gap-1.5 border-slate-200 text-xs text-muted-foreground hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
          >
            <Percent className="size-3.5" aria-hidden="true" />
            Aplicar variación por día
          </Button>
        </div>
      </div>

      {uncovered.map((day) => {
        const index = days.findIndex((item) => item.id === day.id)
        return (
          <p
            key={day.id}
            className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
          >
            {scheduleDayMissingTicketsMessage(day, index)}
          </p>
        )
      })}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-44 bg-white px-3 py-2 text-left text-xs font-bold text-slate-700 dark:bg-zinc-950 dark:text-zinc-200">
                Tipo de entrada
              </th>
              {days.map((day, index) => (
                <th
                  key={day.id}
                  className={cn(
                    "min-w-48 px-3 py-2 text-left text-xs font-bold",
                    uncoveredIds.has(day.id)
                      ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"
                      : "text-slate-700 dark:text-zinc-200",
                  )}
                >
                  {formatInventoryDayOption(day, index)}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={days.length + 2}
                  className="px-3 py-6 text-sm text-muted-foreground"
                >
                  Todavía no hay tipos de entrada por día. Agregá General, VIP u
                  otra categoría.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.nameKey}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-3 align-top dark:bg-zinc-950">
                    <Input
                      defaultValue={row.name}
                      onBlur={(event) => {
                        if (event.target.value.trim() === row.name) return
                        renameRow(row.nameKey, event.target.value)
                      }}
                      className={cellControlClass}
                      aria-label="Nombre del tipo de entrada"
                    />
                  </td>
                  {days.map((day) => {
                    const cell = row.cells[day.id]
                    return (
                      <td
                        key={day.id}
                        className={cn(
                          "px-3 py-3 align-top",
                          uncoveredIds.has(day.id) &&
                            "bg-amber-50/70 dark:bg-amber-500/5",
                        )}
                      >
                        <div
                          className={cn(
                            "space-y-2 rounded-xl border p-2.5",
                            cell?.enabled
                              ? "border-slate-200 bg-slate-50 dark:border-zinc-800 dark:bg-zinc-900/50"
                              : "border-dashed border-slate-200 bg-transparent opacity-70 dark:border-zinc-800",
                          )}
                        >
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={Boolean(cell?.enabled)}
                              onChange={(event) =>
                                setCellEnabled(
                                  row.nameKey,
                                  day.id,
                                  event.target.checked,
                                )
                              }
                              className="size-3.5 rounded border-slate-300 text-emerald-600"
                            />
                            En venta
                          </label>
                          <PriceInput
                            value={cell?.price}
                            onValueChange={(value) =>
                              setCellPrice(row.nameKey, day.id, value)
                            }
                            placeholder="Precio ($)"
                            allowEmpty
                            className={cellControlClass}
                          />
                          <Input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            placeholder="Stock"
                            value={cell?.capacity ?? ""}
                            onChange={(event) =>
                              setCellStock(row.nameKey, day.id, event.target.value)
                            }
                            className={cellControlClass}
                          />
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-2 py-3 align-top">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeRow(row.nameKey)}
                      aria-label={`Quitar ${row.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={addType}
        className="h-11 w-full rounded-xl"
      >
        <Plus className="size-4" />
        Agregar tipo de entrada
      </Button>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Abonos y pases completo (todos los días)
          </h4>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Estas entradas cubren el festival entero. No se atan a una jornada.
          </p>
        </div>
        {passes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Todavía no hay un abono. Ejemplo: Abono {days.length} días.
          </p>
        ) : (
          <ul className="space-y-2">
            {passes.map(({ ticket, index }) => (
              <li
                key={ticket.id ?? `pass-${index}`}
                className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-[1fr_8rem_7rem_auto] sm:items-end"
              >
                <label className="min-w-0">
                  <span className={STUDIO_LABEL_CLASS}>Nombre</span>
                  <Input
                    value={ticket.name}
                    onChange={(event) =>
                      patchTicket(index, { name: event.target.value })
                    }
                    className={cellControlClass}
                  />
                </label>
                <label>
                  <span className={STUDIO_LABEL_CLASS}>Precio</span>
                  <PriceInput
                    value={ticket.price}
                    onValueChange={(value) =>
                      patchTicket(index, { price: value ?? 0 })
                    }
                    placeholder="Precio ($)"
                    className={cellControlClass}
                  />
                </label>
                <label>
                  <span className={STUDIO_LABEL_CLASS}>Cupo</span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={ticket.capacity ?? ""}
                    onChange={(event) => {
                      const parsed = parseStrictInt(event.target.value)
                      patchTicket(index, {
                        capacity:
                          typeof parsed === "number" && !Number.isNaN(parsed)
                            ? parsed
                            : 0,
                      })
                    }}
                    placeholder="Stock"
                    className={cellControlClass}
                  />
                </label>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => removePass(index)}
                  aria-label={`Quitar ${ticket.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" onClick={addPass} className="h-11">
          <Plus className="size-4" />
          Agregar abono / pase completo
        </Button>
      </div>

      <Dialog open={variationOpen} onOpenChange={setVariationOpen}>
        <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar variación por día</DialogTitle>
            <DialogDescription>
              Sumá un monto o un porcentaje a las tarifas activas de un día.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className={STUDIO_LABEL_CLASS}>Día</span>
              <Select
                value={variationDayId}
                onValueChange={(value) => {
                  if (value) setVariationDayId(value)
                }}
                items={days.map((day, index) => ({
                  value: day.id,
                  label: formatInventoryDayOption(day, index),
                }))}
              >
                <SelectTrigger className={STUDIO_CONTROL_CLASS}>
                  <SelectValue placeholder="Elegí un día">
                    {formatInventoryDayOption(
                      days.find((day) => day.id === variationDayId) ?? days[0]!,
                      Math.max(
                        0,
                        days.findIndex((day) => day.id === variationDayId),
                      ),
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className={STUDIO_SELECT_CONTENT_CLASS}>
                  {days.map((day, index) => (
                    <SelectItem key={day.id} value={day.id}>
                      {formatInventoryDayOption(day, index)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={variationKind === "amount" ? "default" : "outline"}
                onClick={() => setVariationKind("amount")}
                className="h-10"
              >
                Monto ($)
              </Button>
              <Button
                type="button"
                variant={variationKind === "percent" ? "default" : "outline"}
                onClick={() => setVariationKind("percent")}
                className="h-10"
              >
                Porcentaje
              </Button>
            </div>
            <label className="block">
              <span className={STUDIO_LABEL_CLASS}>
                {variationKind === "amount" ? "Sumar o restar" : "Variación %"}
              </span>
              <Input
                type="number"
                inputMode="decimal"
                value={variationValue}
                onChange={(event) => setVariationValue(event.target.value)}
                placeholder={variationKind === "amount" ? "5000" : "15"}
                className={STUDIO_CONTROL_CLASS}
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVariationOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={applyVariation}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
