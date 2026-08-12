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
  const [sponsored, setSponsored] = useState(initial.isSponsoredByTokepass)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateEventCommercialSettings(initial.eventId, {
        platformFeePercentage: Number(percentage),
        platformFixedFee: Number(fixedFee),
        maxFreeTickets: Number(maxFree),
        isSponsoredByTokepass: sponsored,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Configuración comercial guardada", {
        description:
          result.recalculatedTiers > 0
            ? `Se recalcularon ${result.recalculatedTiers} tipos de entrada.`
            : "Sin tiers para recalcular.",
      })
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30">
          <Shield className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-white">
            Fees y anti-fraude (SuperAdmin)
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Estos valores rigen el split All-In del evento y el tope de entradas
            a $0. Solo SuperAdmin puede modificarlos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="platform_fee_percentage">
            Comisión plataforma (%)
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
            className="border-zinc-700 bg-zinc-900"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="platform_fixed_fee">Cargo fijo (ARS)</Label>
          <Input
            id="platform_fixed_fee"
            type="number"
            min={0}
            step="0.01"
            value={fixedFee}
            onChange={(e) => setFixedFee(e.target.value)}
            disabled={pending || sponsored}
            className="border-zinc-700 bg-zinc-900"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="max_free_tickets">Máx. entradas gratuitas</Label>
          <Input
            id="max_free_tickets"
            type="number"
            min={0}
            step={1}
            value={maxFree}
            onChange={(e) => setMaxFree(e.target.value)}
            disabled={pending}
            className="border-zinc-700 bg-zinc-900"
          />
          <p className="text-xs text-zinc-500">
            Suma de capacidades de tiers a precio $0 (excluye cortesía /
            FreePass de listas).
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-4 text-amber-300" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-50">
              Auspiciado por Tokepass
            </p>
            <p className="mt-0.5 text-xs text-amber-100/70">
              Bonifica infraestructura (fee % y fijo = 0) y muestra branding
              premium en la ficha y la entrada.
            </p>
          </div>
        </div>
        <Switch
          checked={sponsored}
          onCheckedChange={setSponsored}
          disabled={pending}
          aria-label="Auspiciado por Tokepass"
        />
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
        Guardar configuración
      </Button>
    </form>
  )
}
