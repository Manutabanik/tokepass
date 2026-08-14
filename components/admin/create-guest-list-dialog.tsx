"use client"

import { LoaderCircle, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { createGuestList } from "@/app/actions/guest-lists"
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

export function CreateGuestListDialog({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [maxGuests, setMaxGuests] = useState("50")
  const [validUntilLocal, setValidUntilLocal] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    startTransition(async () => {
      const result = await createGuestList({
        eventId,
        name,
        maxGuests: Number(maxGuests),
        validUntil: validUntilLocal
          ? new Date(validUntilLocal).toISOString()
          : "",
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success("Lista creada")
      setOpen(false)
      setName("")
      setMaxGuests("50")
      setValidUntilLocal("")
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
        <Plus className="size-4" />
        Nueva Lista
      </Button>

      <DialogContent className="border-border bg-card text-card-foreground sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nueva lista digital</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Definí cupos y la hora límite de ingreso (Smart Yield).
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="list-name">Nombre</Label>
              <Input
                id="list-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Lista promotores Tomás"
                required
                className="border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="list-max">Cupos máximos</Label>
              <Input
                id="list-max"
                type="number"
                min={1}
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value)}
                required
                className="border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="list-until">Hora límite de ingreso</Label>
              <Input
                id="list-until"
                type="datetime-local"
                value={validUntilLocal}
                onChange={(e) => setValidUntilLocal(e.target.value)}
                required
                className="border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950"
              />
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
                "Crear lista"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
