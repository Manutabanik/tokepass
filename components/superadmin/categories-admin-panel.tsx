"use client"

import { useMemo, useState, useTransition } from "react"
import { Check, LoaderCircle, Plus, Power } from "lucide-react"

import {
  createEventCategory,
  setEventCategoryActive,
  updateEventCategory,
} from "@/app/actions/categories"
import { resolveCategoryIcon } from "@/lib/category-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { EventCategory } from "@/types/database"

export function CategoriesAdminPanel({
  initialCategories,
}: {
  initialCategories: EventCategory[]
}) {
  const [categories, setCategories] = useState(initialCategories)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err"
    text: string
  } | null>(null)

  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [iconName, setIconName] = useState("sparkles")
  const [editingId, setEditingId] = useState<string | null>(null)

  const editing = useMemo(
    () => categories.find((c) => c.id === editingId) ?? null,
    [categories, editingId],
  )

  function resetForm() {
    setEditingId(null)
    setName("")
    setSlug("")
    setIconName("sparkles")
  }

  function startEdit(row: EventCategory) {
    setEditingId(row.id)
    setName(row.name)
    setSlug(row.slug)
    setIconName(row.icon_name ?? "sparkles")
    setFeedback(null)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      if (editingId) {
        const result = await updateEventCategory({
          id: editingId,
          name,
          slug,
          iconName,
          isActive: editing?.is_active ?? true,
          sortOrder: editing?.sort_order,
        })
        if (!result.success) {
          setFeedback({ type: "err", text: result.error })
          return
        }
        setCategories((prev) =>
          prev.map((c) => (c.id === result.category.id ? result.category : c)),
        )
        setFeedback({ type: "ok", text: "Categoría actualizada." })
        resetForm()
        return
      }

      const result = await createEventCategory({ name, slug, iconName })
      if (!result.success) {
        setFeedback({ type: "err", text: result.error })
        return
      }
      setCategories((prev) => [...prev, result.category].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
        return a.name.localeCompare(b.name, "es")
      }))
      setFeedback({ type: "ok", text: "Categoría creada." })
      resetForm()
    })
  }

  function toggleActive(row: EventCategory) {
    setFeedback(null)
    startTransition(async () => {
      const next = !row.is_active
      const result = await setEventCategoryActive(row.id, next)
      if (!result.success) {
        setFeedback({ type: "err", text: result.error })
        return
      }
      setCategories((prev) =>
        prev.map((c) => (c.id === row.id ? { ...c, is_active: next } : c)),
      )
    })
  }

  const PreviewIcon = resolveCategoryIcon(iconName)

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/8 bg-white/[0.03] p-5 sm:p-6"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              {editingId ? "Editar categoría" : "Nueva categoría"}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Poné un nombre claro, un identificador corto (sin espacios) y el
              nombre del ícono (por ejemplo mic2, trophy o theater).
            </p>
          </div>
          <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-black/30 text-zinc-200">
            <PreviewIcon className="size-5" aria-hidden />
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5 sm:col-span-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Nombre
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Teatro & Cultura"
              required
              className="h-10 border-white/10 bg-black/20 text-zinc-100"
            />
          </label>
          <label className="space-y-1.5 sm:col-span-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Identificador corto
            </span>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="teatro-y-cultura"
              className="h-10 border-white/10 bg-black/20 font-mono text-sm text-zinc-100"
            />
          </label>
          <label className="space-y-1.5 sm:col-span-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Nombre del ícono
            </span>
            <Input
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="clapperboard"
              className="h-10 border-white/10 bg-black/20 font-mono text-sm text-zinc-100"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={isPending}
            className="gap-2 bg-sky-600 text-white hover:bg-sky-500"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : editingId ? (
              <Check className="size-4" />
            ) : (
              <Plus className="size-4" />
            )}
            {editingId ? "Guardar cambios" : "Crear categoría"}
          </Button>
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              className="text-zinc-400 hover:text-white"
            >
              Cancelar
            </Button>
          ) : null}
          {feedback ? (
            <span
              className={cn(
                "text-xs",
                feedback.type === "ok" ? "text-emerald-400" : "text-red-400",
              )}
            >
              {feedback.text}
            </span>
          ) : null}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="border-white/8 hover:bg-transparent">
              <TableHead className="pl-5 text-zinc-600">Categoría</TableHead>
              <TableHead className="text-zinc-600">Slug</TableHead>
              <TableHead className="text-zinc-600">Icono</TableHead>
              <TableHead className="text-zinc-600">Estado</TableHead>
              <TableHead className="pr-5 text-right text-zinc-600">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((row) => {
              const Icon = resolveCategoryIcon(row.icon_name)
              return (
                <TableRow
                  key={row.id}
                  className="border-white/8 hover:bg-white/[0.025]"
                >
                  <TableCell className="py-3.5 pl-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-white/5 text-zinc-200">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="font-medium text-zinc-100">
                        {row.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-400">
                    {row.slug}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-500">
                    {row.icon_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
                        row.is_active
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-zinc-500/15 text-zinc-400",
                      )}
                    >
                      {row.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-zinc-300 hover:text-white"
                        onClick={() => startEdit(row)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        className="gap-1.5 text-zinc-400 hover:text-white"
                        onClick={() => toggleActive(row)}
                        aria-label={
                          row.is_active ? "Desactivar" : "Activar"
                        }
                      >
                        <Power className="size-3.5" />
                        {row.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {categories.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-zinc-500">
            Todavía no hay categorías. Creá la primera arriba.
          </p>
        ) : null}
      </div>
    </div>
  )
}
