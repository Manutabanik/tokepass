"use client"

import { LoaderCircle, Percent } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updatePlatformResaleFeePercentage } from "@/app/actions/platform-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function PlatformResaleFeeForm({
  initialPercentage,
}: {
  initialPercentage: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [percentage, setPercentage] = useState(String(initialPercentage))

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updatePlatformResaleFeePercentage(Number(percentage))
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setPercentage(String(result.percentage))
      toast.success("Comisión de reventa actualizada.")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="resale-fee-percentage">
          Costo administrativo de reventa
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="resale-fee-percentage"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            required
            value={percentage}
            disabled={pending}
            onChange={(event) => setPercentage(event.target.value)}
            className="max-w-36"
          />
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Percent className="size-3.5" aria-hidden="true" />
            sobre el precio original
          </span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Este porcentaje se descuenta al vendedor al publicar. El comprador
          paga el precio original de la entrada.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="rounded-xl">
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Guardar porcentaje
      </Button>
    </form>
  )
}
