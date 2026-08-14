"use client"

import {
  Accessibility,
  Layers,
  LoaderCircle,
  Package,
  Plus,
  Ticket,
  Trash2,
} from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  deleteTicketBundle,
  upsertTicketBundle,
  type BundleStoreItem,
  type ManagedTicketTier,
} from "@/app/actions/ticket-bundles"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatCurrency } from "@/lib/format"
import {
  discountPercent,
  TICKET_TIER_CATEGORY_LABELS,
  type TicketTierCategory,
} from "@/lib/ticket-tier-category"
import type { ScheduleDay } from "@/types/events"
import { cn } from "@/lib/utils"

type ComboDraft = { eventItemId: string; quantity: string }

type Props = {
  eventId: string
  eventTitle: string
  scheduleDays: ScheduleDay[]
  initialTiers: ManagedTicketTier[]
  storeItems: BundleStoreItem[]
}

export function TicketBundleManager({
  eventId,
  eventTitle,
  scheduleDays,
  initialTiers,
  storeItems,
}: Props) {
  const [tiers, setTiers] = useState(initialTiers)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<TicketTierCategory>("bundle")
  const [salePrice, setSalePrice] = useState("0")
  const [capacity, setCapacity] = useState("100")
  const [dayId, setDayId] = useState<string>("all")
  const [comboLines, setComboLines] = useState<ComboDraft[]>([])
  const [isPending, startTransition] = useTransition()

  const extrasTotal = useMemo(() => {
    return comboLines.reduce((sum, line) => {
      const item = storeItems.find((i) => i.id === line.eventItemId)
      const qty = Math.max(1, Number(line.quantity) || 1)
      return sum + (item ? item.price * qty : 0)
    }, 0)
  }, [comboLines, storeItems])

  const dayCount =
    dayId === "all" ? Math.max(1, scheduleDays.length) : 1
  const cheapestStandard = useMemo(() => {
    const standards = tiers.filter((t) => t.category === "standard")
    if (standards.length === 0) return 0
    return Math.min(...standards.map((t) => t.price))
  }, [tiers])

  const accumulated = extrasTotal + cheapestStandard * (category === "bundle" ? dayCount : 1)
  const sale = Math.max(0, Number(salePrice) || 0)
  const pct = discountPercent(accumulated, sale)

  function resetForm() {
    setEditingId(null)
    setName("")
    setCategory("bundle")
    setSalePrice("0")
    setCapacity("100")
    setDayId("all")
    setComboLines([])
  }

  function loadTier(tier: ManagedTicketTier) {
    setEditingId(tier.id)
    setName(tier.name)
    setCategory(tier.category)
    setSalePrice(String(tier.price))
    setCapacity(String(tier.capacity))
    setDayId(tier.dayId ?? "all")
    setComboLines(
      tier.comboItems.map((line) => ({
        eventItemId: line.eventItemId,
        quantity: String(line.quantity),
      })),
    )
  }

  function save() {
    startTransition(async () => {
      const result = await upsertTicketBundle({
        eventId,
        tierId: editingId,
        name,
        category,
        salePrice: sale,
        listPrice: accumulated,
        capacity: Number(capacity),
        dayId: dayId === "all" ? null : dayId,
        comboItems: comboLines
          .filter((line) => line.eventItemId)
          .map((line) => ({
            eventItemId: line.eventItemId,
            quantity: Number(line.quantity) || 1,
          })),
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(editingId ? "Tarifa actualizada" : "Tarifa creada")
      window.location.reload()
    })
  }

  function remove(tier: ManagedTicketTier) {
    startTransition(async () => {
      const result = await deleteTicketBundle({ eventId, tierId: tier.id })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setTiers((prev) => prev.filter((t) => t.id !== tier.id))
      if (editingId === tier.id) resetForm()
      toast.success("Tarifa eliminada")
    })
  }

  const categoryItems = [
    { value: "bundle", label: TICKET_TIER_CATEGORY_LABELS.bundle },
    { value: "special", label: TICKET_TIER_CATEGORY_LABELS.special },
    { value: "standard", label: TICKET_TIER_CATEGORY_LABELS.standard },
  ]

  const dayItems = [
    { value: "all", label: "Abono / todas las jornadas" },
    ...scheduleDays.map((day) => ({
      value: day.id,
      label: day.title,
    })),
  ]

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{eventTitle}</p>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Package className="size-4 text-emerald-700 dark:text-emerald-400" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {editingId ? "Editar tarifa" : "Nueva tarifa / combo"}
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Abono 2 noches + consumición"
              className="h-11"
            />
          </div>
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select
              value={category}
              onValueChange={(v) =>
                v && setCategory(v as TicketTierCategory)
              }
              items={categoryItems}
            >
              <SelectTrigger className="h-11">
                <SelectValue>
                  {TICKET_TIER_CATEGORY_LABELS[category]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Días de acceso</Label>
            <Select
              value={dayId}
              onValueChange={(v) => v && setDayId(v)}
              items={dayItems}
            >
              <SelectTrigger className="h-11">
                <SelectValue>
                  {dayItems.find((d) => d.value === dayId)?.label ?? null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {dayItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Precio de venta (All-In)</Label>
            <Input
              type="number"
              min={0}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1">
            <Label>Cupo</Label>
            <Input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="h-11"
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label>Ítems incluidos (parking, gastronomía, merch)</Label>
          {comboLines.map((line, index) => (
            <div key={`${line.eventItemId}-${index}`} className="flex gap-2">
              <Select
                value={line.eventItemId}
                onValueChange={(v) => {
                  if (!v) return
                  setComboLines((prev) =>
                    prev.map((row, i) =>
                      i === index ? { ...row, eventItemId: v } : row,
                    ),
                  )
                }}
                items={storeItems.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${formatCurrency(item.price)}`,
                }))}
              >
                <SelectTrigger className="h-11 flex-1">
                  <SelectValue placeholder="Producto">
                    {storeItems.find((i) => i.id === line.eventItemId)?.name ??
                      null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {storeItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="truncate">{item.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatCurrency(item.price)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) =>
                  setComboLines((prev) =>
                    prev.map((row, i) =>
                      i === index ? { ...row, quantity: e.target.value } : row,
                    ),
                  )
                }
                className="h-11 w-20"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setComboLines((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {storeItems.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setComboLines((prev) => [
                  ...prev,
                  {
                    eventItemId: storeItems[0]?.id ?? "",
                    quantity: "1",
                  },
                ])
              }
            >
              <Plus className="size-3.5" />
              Agregar extra
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Creá productos en la Tienda de Extras para armar kits.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="font-medium text-emerald-950 dark:text-emerald-200">
            Valor acumulado {formatCurrency(accumulated)}
            {pct > 0 ? ` · Ahorro ${pct}%` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">
            Suma extras + referencia de entrada individual
            {category === "bundle" && scheduleDays.length > 1
              ? ` × ${dayCount} jornada${dayCount === 1 ? "" : "s"}`
              : ""}
            . El precio de venta es el que paga el comprador.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={isPending} onClick={save} className="min-h-11">
            {isPending ? <LoaderCircle className="animate-spin" /> : null}
            {editingId ? "Guardar cambios" : "Crear tarifa"}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        {tiers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Todavía no hay tarifas. Creá un combo o una entrada especial.
          </p>
        ) : (
          tiers.map((tier) => {
            const Icon =
              tier.category === "special"
                ? Accessibility
                : tier.category === "bundle"
                  ? Layers
                  : Ticket
            const savePct = discountPercent(tier.listPrice ?? 0, tier.price)
            return (
              <article
                key={tier.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <p className="font-semibold text-foreground">{tier.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TICKET_TIER_CATEGORY_LABELS[tier.category]} ·{" "}
                    {formatCurrency(tier.price)}
                    {savePct > 0 ? ` · Ahorro ${savePct}%` : ""} · {tier.sold}/
                    {tier.capacity}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => loadTier(tier)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={tier.sold > 0 || isPending}
                    className={cn("text-muted-foreground hover:text-red-600")}
                    onClick={() => remove(tier)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
