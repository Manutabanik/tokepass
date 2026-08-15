"use client"

import { LoaderCircle, Save, Ticket } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  updateEventPurchaseLimits,
  type EventPurchaseLimits,
} from "@/app/actions/event-purchase-limits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function EventPurchaseLimitsForm({
  initial,
}: {
  initial: EventPurchaseLimits
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [limitValue, setLimitValue] = useState(
    initial.maxTicketsPerUser != null ? String(initial.maxTicketsPerUser) : "",
  )

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = limitValue.trim()
    const parsed = trimmed.length === 0 ? null : Number(trimmed)
    startTransition(async () => {
      const result = await updateEventPurchaseLimits(initial.eventId, {
        maxTicketsPerUser: parsed,
      })
      if (!result.success) {
        toast.error("No se pudo guardar", { description: result.error })
        return
      }
      setLimitValue(
        result.data.maxTicketsPerUser != null
          ? String(result.data.maxTicketsPerUser)
          : "",
      )
      toast.success("Límite actualizado", {
        description:
          result.data.maxTicketsPerUser != null
            ? `Máximo ${result.data.maxTicketsPerUser} lugares por comprador.`
            : "Este evento no tiene límite de compra por usuario.",
      })
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-300">
          <Ticket className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Límite de compra por usuario
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tope de entradas o mesas por comprador en cada transacción. Dejá el
            campo vacío para permitir compras sin límite.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="max-tickets-per-user">
          Límite de entradas/mesas por usuario por transacción
        </Label>
        <Input
          id="max-tickets-per-user"
          type="number"
          min={1}
          max={200}
          step={1}
          inputMode="numeric"
          placeholder="Sin límite"
          value={limitValue}
          onChange={(event) => setLimitValue(event.target.value)}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Vacío o 0 equivale a sin límites. El checkout B2C oculta el badge y
          no bloquea la suma de ítems.
        </p>
      </div>

      <Button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="size-4" aria-hidden="true" />
        )}
        Guardar límite
      </Button>
    </form>
  )
}
