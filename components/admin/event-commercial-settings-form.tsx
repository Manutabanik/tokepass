"use client"

import { LoaderCircle, Save, Shield, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  updateEventCommercialSettings,
  type EventCommercialSettings,
} from "@/app/actions/events"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function EventCommercialSettingsForm({
  initial,
}: {
  initial: EventCommercialSettings
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [percentage, setPercentage] = useState(
    String(initial.platformFeePercentage),
  )
  const [fixedFee, setFixedFee] = useState(String(initial.platformFixedFee))
  const [maxFree, setMaxFree] = useState(String(initial.maxFreeTickets))
  const [sponsored, setSponsored] = useState(initial.isSponsoredByTokePass)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateEventCommercialSettings(initial.eventId, {
        platformFeePercentage: Number(percentage),
        platformFixedFee: Number(fixedFee),
        maxFreeTickets: Number(maxFree),
        isSponsoredByTokePass: sponsored,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Reglas comerciales guardadas", {
        description:
          result.recalculatedTiers > 0
            ? `Actualizamos los precios de ${result.recalculatedTiers} tipos de entrada.`
            : "No había tipos de entrada para actualizar.",
      })
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-6 ring-1 ring-white/8"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30">
          <Shield className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-foreground">
            Reglas Comerciales
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acá configurás cuánto le cobramos al comprador por usar TokePass y si
            le hacemos algún descuento al organizador. Solo vos, como dueño de la
            plataforma, podés cambiar estos valores.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 text-amber-300" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-50">
              Auspicio en Portada
            </p>
            <p className="mt-0.5 text-xs text-amber-100/70">
              Si lo activás, el evento aparece primero en Destacados, muestra el
              sello de Auspiciado y TokePass no le cobra comisión al comprador
              (queda en cero).
            </p>
          </div>
        </div>
        <Switch
          checked={sponsored}
          onCheckedChange={setSponsored}
          disabled={pending}
          aria-label="Auspicio en Portada"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="platform_fee_percentage">
            Comisión de la ticketera (%)
          </Label>
          <Input
            id="platform_fee_percentage"
            type="number"
            min={0}
            max={95}
            step="0.01"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            disabled={pending || sponsored}
            className="border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900"
          />
          <p className="text-xs text-muted-foreground">
            Porcentaje que se suma al precio de la entrada al momento del pago.
            Ejemplo: 8 significa un 8%.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform_fixed_fee">Cargo fijo por entrada (ARS)</Label>
          <Input
            id="platform_fixed_fee"
            type="number"
            min={0}
            step="0.01"
            value={fixedFee}
            onChange={(e) => setFixedFee(e.target.value)}
            disabled={pending || sponsored}
            className="border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900"
          />
          <p className="text-xs text-muted-foreground">
            Monto fijo en pesos que se suma a cada entrada paga, además del
            porcentaje.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="max_free_tickets">
            Tope de cortesías (entradas sin cargo)
          </Label>
          <Input
            id="max_free_tickets"
            type="number"
            min={0}
            step={1}
            value={maxFree}
            onChange={(e) => setMaxFree(e.target.value)}
            disabled={pending}
            className="border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900"
          />
          <p className="text-xs text-muted-foreground">
            Cantidad máxima de entradas a $0 que puede crear el organizador para
            este evento. No incluye invitaciones de lista de invitados.
          </p>
        </div>
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
        Guardar reglas
      </Button>
    </form>
  )
}
