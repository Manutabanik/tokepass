"use client"

import { LoaderCircle, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createPromoter } from "@/app/actions/promoters"
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

export function AddPromoterDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [commissionPercent, setCommissionPercent] = useState("10")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    startTransition(async () => {
      const result = await createPromoter({
        name,
        commissionPercent: Number(commissionPercent),
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success("Promotor creado", {
        description: `Código: ${result.referralCode}`,
      })
      setName("")
      setCommissionPercent("10")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 rounded-xl bg-violet-600 text-white hover:bg-violet-500"
      >
        <Plus className="size-4" aria-hidden="true" />
        Agregar promotor
      </Button>

      <DialogContent className="border-white/10 bg-[#121216] text-zinc-100 sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Agregar promotor</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Generamos un código de referido único para su link de ventas.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="promoter-name">Nombre</Label>
              <Input
                id="promoter-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tomás VIP"
                required
                className="border-white/10 bg-zinc-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promoter-commission">Comisión (%)</Label>
              <Input
                id="promoter-commission"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commissionPercent}
                onChange={(event) => setCommissionPercent(event.target.value)}
                required
                className="border-white/10 bg-zinc-950"
              />
              <p className="text-xs text-zinc-500">
                Ej: 10 = 10% sobre el total de órdenes pagadas.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="submit"
              disabled={isPending}
              className="h-11 rounded-xl bg-violet-600 text-white hover:bg-violet-500"
            >
              {isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Creando…
                </>
              ) : (
                "Crear promotor"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
