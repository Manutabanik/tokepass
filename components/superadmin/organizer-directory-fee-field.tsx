"use client"

import { LoaderCircle, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { updateOrganizerFeeRate } from "@/app/actions/superadmin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function OrganizerDirectoryFeeField({
  organizerId,
  feePercentage,
}: {
  organizerId: string
  feePercentage: number
}) {
  const router = useRouter()
  const [value, setValue] = useState(String(feePercentage))
  const [pending, startTransition] = useTransition()

  function save() {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 95) {
      toast.error("La comisión debe estar entre 0% y 95%.")
      return
    }

    startTransition(async () => {
      const result = await updateOrganizerFeeRate(organizerId, parsed / 100)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`Comisión actualizada a ${parsed}%.`)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`organizer-fee-${organizerId}`}>
        Comisión de la ticketera
      </label>
      <div className="relative">
        <Input
          id={`organizer-fee-${organizerId}`}
          type="number"
          min={0}
          max={95}
          step={0.1}
          value={value}
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-[5.5rem] pr-7 font-mono text-sm"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={save}
        className="min-h-11"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        <span className="sr-only">Guardar comisión</span>
      </Button>
    </div>
  )
}
