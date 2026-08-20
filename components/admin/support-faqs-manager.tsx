"use client"

import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createSupportFaq,
  deleteSupportFaq,
  updateSupportFaq,
  type SupportFaqItem,
} from "@/app/actions/support-faqs"
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
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

type Draft = {
  id?: string
  question: string
  answer: string
  isActive: boolean
  order: string
}

const EMPTY_DRAFT: Draft = {
  question: "",
  answer: "",
  isActive: true,
  order: "",
}

export function SupportFaqsManager({
  initialFaqs,
}: {
  initialFaqs: SupportFaqItem[]
}) {
  const [faqs, setFaqs] = useState(initialFaqs)
  const [pending, startTransition] = useTransition()
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SupportFaqItem | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)

  function openCreate() {
    setDraft({
      ...EMPTY_DRAFT,
      order: String(faqs.length === 0 ? 0 : Math.max(...faqs.map((item) => item.order)) + 1),
    })
    setEditorOpen(true)
  }

  function openEdit(faq: SupportFaqItem) {
    setDraft({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      isActive: faq.isActive,
      order: String(faq.order),
    })
    setEditorOpen(true)
  }

  function saveDraft() {
    const payload = {
      question: draft.question,
      answer: draft.answer,
      isActive: draft.isActive,
      order: Number(draft.order),
    }
    startTransition(async () => {
      const result = draft.id
        ? await updateSupportFaq({ id: draft.id, ...payload })
        : await createSupportFaq(payload)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setFaqs((current) => {
        const next = draft.id
          ? current.map((item) =>
              item.id === result.data.id ? result.data : item,
            )
          : [...current, result.data]
        return next.sort(
          (left, right) =>
            left.order - right.order ||
            left.question.localeCompare(right.question, "es"),
        )
      })
      setEditorOpen(false)
      toast.success(draft.id ? "Pregunta actualizada" : "Pregunta creada")
    })
  }

  function confirmDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    startTransition(async () => {
      const result = await deleteSupportFaq(id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setFaqs((current) => current.filter((item) => item.id !== id))
      setDeleteTarget(null)
      toast.success("Pregunta eliminada")
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {faqs.length === 0
            ? "Todavia no hay preguntas."
            : `${faqs.length} pregunta${faqs.length === 1 ? "" : "s"}`}
        </p>
        <Button type="button" onClick={openCreate} className="min-h-11">
          <Plus className="size-4" aria-hidden />
          Nueva Pregunta
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Orden</TableHead>
              <TableHead>Pregunta</TableHead>
              <TableHead className="hidden md:table-cell">Respuesta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-28 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faqs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Crea la primera pregunta para el modulo de soporte.
                </TableCell>
              </TableRow>
            ) : (
              faqs.map((faq) => (
                <TableRow key={faq.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {faq.order}
                  </TableCell>
                  <TableCell className="max-w-[18rem] whitespace-normal font-medium text-foreground">
                    {faq.question}
                  </TableCell>
                  <TableCell className="hidden max-w-[22rem] whitespace-normal text-muted-foreground md:table-cell">
                    {faq.answer.length > 140
                      ? `${faq.answer.slice(0, 140)}…`
                      : faq.answer}
                  </TableCell>
                  <TableCell>
                    <Badge variant={faq.isActive ? "default" : "secondary"}>
                      {faq.isActive ? "Activa" : "Oculta"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Editar pregunta"
                        onClick={() => openEdit(faq)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Eliminar pregunta"
                        onClick={() => setDeleteTarget(faq)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? "Editar pregunta" : "Nueva pregunta"}
            </DialogTitle>
            <DialogDescription>
              Titulo visible, respuesta detallada y visibilidad en el modulo de
              soporte.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="faq-question">Titulo de la pregunta</Label>
              <Input
                id="faq-question"
                value={draft.question}
                maxLength={180}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    question: event.target.value,
                  }))
                }
                placeholder="Como descargo mi entrada?"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="faq-answer">Respuesta detallada</Label>
              <Textarea
                id="faq-answer"
                value={draft.answer}
                maxLength={8000}
                rows={8}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    answer: event.target.value,
                  }))
                }
                placeholder="Explica el paso a paso para la persona que consulta."
                className="min-h-36"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="faq-order">Orden</Label>
                <Input
                  id="faq-order"
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.order}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      order: event.target.value,
                    }))
                  }
                />
              </div>
              <label className="flex h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
                <span className="text-sm font-medium">Visible</span>
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, isActive: checked }))
                  }
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={saveDraft} disabled={pending}>
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {draft.id ? "Guardar cambios" : "Crear pregunta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar pregunta</DialogTitle>
            <DialogDescription>
              Se va a borrar “{deleteTarget?.question}”. Esta accion no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
