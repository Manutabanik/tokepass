"use client"

import {
  Gift,
  Plus,
  Trash2,
} from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  deleteTicketBundle,
  upsertTicketBundle,
  type ManagedTicketTier,
} from "@/app/actions/ticket-bundles"
import {
  BundleCreatorModal,
  type BundleComponentOption,
  type BundleCreatorValue,
} from "@/components/admin/bundle-creator-modal"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import {
  BUNDLE_TYPE_LABELS,
  inferBundleType,
  inferPromoRule,
  type BundleType,
} from "@/lib/inventory/flexible-bundles"
import { inferInventoryTierType } from "@/lib/inventory/unified-inventory"
import { discountPercent } from "@/lib/ticket-tier-category"
import type { ScheduleDay } from "@/types/events"
import { cn } from "@/lib/utils"

type Props = {
  eventId: string
  eventTitle: string
  scheduleDays: ScheduleDay[]
  initialTiers: ManagedTicketTier[]
}

export function TicketBundleManager({
  eventId,
  eventTitle,
  scheduleDays,
  initialTiers,
}: Props) {
  const [tiers, setTiers] = useState(initialTiers)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedTicketTier | null>(null)
  const [isPending, startTransition] = useTransition()

  const options: BundleComponentOption[] = useMemo(
    () =>
      tiers
        .filter((tier) => inferInventoryTierType({
          tierType: tier.tierType,
          category: tier.category,
          bundleItems: tier.bundleItems,
        }) !== "bundle")
        .map((tier) => ({
          id: tier.id,
          name: tier.name,
          price: tier.price,
          tierType: inferInventoryTierType({
            tierType: tier.tierType,
            category: tier.category,
            bundleItems: tier.bundleItems,
          }),
          dayId: tier.dayId,
        })),
    [tiers],
  )

  const bundles = tiers.filter(
    (tier) =>
      inferInventoryTierType({
        tierType: tier.tierType,
        category: tier.category,
        bundleItems: tier.bundleItems,
      }) === "bundle",
  )

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(tier: ManagedTicketTier) {
    setEditing(tier)
    setOpen(true)
  }

  function save(value: BundleCreatorValue) {
    startTransition(async () => {
      const result = await upsertTicketBundle({
        eventId,
        tierId: editing?.id,
        name: value.name,
        category: "bundle",
        salePrice: value.price,
        listPrice: value.originalPrice,
        capacity: value.capacity,
        dayId: value.bundleType === "multi_day_pass" ? null : editing?.dayId ?? null,
        comboItems: [],
        bundleType: value.bundleType,
        bundleItems: value.items,
        promoRule: value.promoRule,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(editing ? "Combo actualizado" : "Combo creado")
      setOpen(false)
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
      setTiers((prev) => prev.filter((row) => row.id !== tier.id))
      toast.success("Combo eliminado")
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{eventTitle}</p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Abonos, packs con extras y descuentos por volumen. El checkout reserva
          el stock de cada componente 8 minutos.
        </p>
        <Button type="button" onClick={openCreate} className="min-h-11">
          <Plus className="size-4" />
          Crear combo / abono
        </Button>
      </div>

      {bundles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Todavía no hay combos. Creá un abono de varios días, un pack con
          estacionamiento o un 4x3 en menos de dos minutos.
        </p>
      ) : (
        <section className="space-y-3">
          {bundles.map((tier) => {
            const type: BundleType = inferBundleType({
              bundleType: tier.bundleType,
              dayId: tier.dayId,
              isMultiDay: scheduleDays.length > 1,
              items: tier.bundleItems,
            })
            const savePct = discountPercent(tier.listPrice ?? 0, tier.price)
            return (
              <article
                key={tier.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Gift className="size-4 text-emerald-700 dark:text-emerald-400" />
                    <p className="font-semibold text-foreground">{tier.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {BUNDLE_TYPE_LABELS[type]} · {formatCurrency(tier.price)}
                    {savePct > 0 ? ` · Ahorro ${savePct}%` : ""} · {tier.sold}/
                    {tier.capacity}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(tier)}
                  >
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
          })}
        </section>
      )}

      <BundleCreatorModal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Editar combo / abono" : "Crear combo / abono"}
        scheduleDays={scheduleDays}
        options={options}
        pending={isPending}
        initial={
          editing
            ? {
                name: editing.name,
                bundleType: inferBundleType({
                  bundleType: editing.bundleType,
                  dayId: editing.dayId,
                  isMultiDay: scheduleDays.length > 1,
                  items: editing.bundleItems,
                }),
                price: editing.price,
                originalPrice: editing.listPrice ?? 0,
                capacity: editing.capacity,
                items: editing.bundleItems,
                promoRule: inferPromoRule({
                  rule: editing.promoDiscountType
                    ? {
                        tipoDescuento: editing.promoDiscountType,
                        valorDescuento: editing.promoDiscountValue,
                        cantidadRequerida: editing.promoRequiredQty,
                        cantidadPaga: editing.promoPayQty,
                      }
                    : null,
                  bundleType: editing.bundleType,
                  items: editing.bundleItems,
                  salePrice: editing.price,
                  regularPrice: editing.listPrice ?? 0,
                }),
                includesSeating: editing.bundleItems.some((item) => {
                  const child = tiers.find((row) => row.id === item.tierId)
                  return child?.tierType === "seated"
                }),
              }
            : null
        }
        onSave={save}
      />
    </div>
  )
}
