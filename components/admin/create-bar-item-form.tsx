"use client"

import { LoaderCircle, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { createEventItem } from "@/app/actions/addons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function CreateBarItemForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [stock, setStock] = useState("50")

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isPending) return

    startTransition(async () => {
      const result = await createEventItem({
        eventId,
        name,
        description: description || null,
        price: Number(price),
        stock: Number.parseInt(stock, 10),
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success("Producto de barra creado")
      setName("")
      setDescription("")
      setPrice("")
      setStock("50")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-white/8 bg-zinc-950/60 p-5"
    >
      <div className="space-y-2">
        <Label htmlFor="bar-name">Nombre</Label>
        <Input
          id="bar-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fernet Branca + 2 Cocas"
          required
          className="border-zinc-800 bg-zinc-950"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bar-desc">Descripción (opcional)</Label>
        <Textarea
          id="bar-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Combo de pre-venta"
          className="min-h-20 border-zinc-800 bg-zinc-950"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bar-price">Precio (ARS)</Label>
          <Input
            id="bar-price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            className="border-zinc-800 bg-zinc-950"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bar-stock">Stock</Label>
          <Input
            id="bar-stock"
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            required
            className="border-zinc-800 bg-zinc-950"
          />
        </div>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-amber-400 text-zinc-950 hover:bg-amber-300"
      >
        {isPending ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Plus />
        )}
        Agregar producto
      </Button>
    </form>
  )
}
