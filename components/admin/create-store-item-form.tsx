"use client"

import { LoaderCircle, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { createEventItem } from "@/app/actions/addons"
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
import { Textarea } from "@/components/ui/textarea"
import {
  EVENT_ITEM_CATEGORIES,
  EVENT_ITEM_CATEGORY_LABELS,
  type EventItemCategory,
} from "@/lib/store-categories"

export function CreateStoreItemForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [stock, setStock] = useState("50")
  const [category, setCategory] = useState<EventItemCategory>("drinks")
  const [imageFile, setImageFile] = useState<File | null>(null)

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
        category,
        imageFile,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success("Producto agregado a la tienda")
      setName("")
      setDescription("")
      setPrice("")
      setStock("50")
      setCategory("drinks")
      setImageFile(null)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/8 dark:bg-zinc-950/60"
    >
      <div className="space-y-2">
        <Label htmlFor="store-name">Nombre del producto</Label>
        <Input
          id="store-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Remera oficial, Combo fernet, Estacionamiento"
          required
          className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="store-category">Categoría</Label>
        <Select
          value={category}
          onValueChange={(value) =>
            setCategory((value as EventItemCategory) || "drinks")
          }
          items={EVENT_ITEM_CATEGORIES.map((value) => ({
            value,
            label: EVENT_ITEM_CATEGORY_LABELS[value],
          }))}
        >
          <SelectTrigger id="store-category" className="h-10 w-full max-w-full overflow-hidden">
            <SelectValue placeholder="Elegí una categoría">
              {EVENT_ITEM_CATEGORY_LABELS[category]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {EVENT_ITEM_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_ITEM_CATEGORY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="store-desc">Descripción (opcional)</Label>
        <Textarea
          id="store-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalle para el comprador y el staff de canje"
          className="min-h-20 border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="store-image">Imagen (opcional, máx. 5MB)</Label>
        <Input
          id="store-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="store-price">Precio (ARS)</Label>
          <Input
            id="store-price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="store-stock">Stock</Label>
          <Input
            id="store-stock"
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            required
            className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-violet-600 text-white hover:bg-violet-500"
      >
        {isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
        Agregar producto
      </Button>
    </form>
  )
}
