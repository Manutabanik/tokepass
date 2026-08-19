"use client"

import { Eye, Link2, LoaderCircle, Pause, Rocket, FilePenLine } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  getOrganizerPreviewShareUrl,
  updateEventSalesStatus,
} from "@/app/actions/events"
import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  canSubmitEventForReview,
  EVENT_SENT_TO_REVIEW_BODY,
  EVENT_SENT_TO_REVIEW_TITLE,
  isPendingEventReview,
  isSandboxEventStatus,
} from "@/lib/events/review-status"
import { cn } from "@/lib/utils"

type EventCommandHeaderProps = {
  eventId: string
  title: string
  subtitle: string
  status: string
  isSponsored: boolean
  reviewNote?: string | null
}

function statusPresentation(status: string): {
  label: string
  className: string
} {
  if (status === "published") {
    return {
      label: "Publicado (En venta)",
      className:
        "border-emerald-500/45 bg-emerald-500/15 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-200",
    }
  }
  if (status === "paused") {
    return {
      label: "Pausado (Oculto)",
      className:
        "border-orange-500/45 bg-orange-500/15 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-orange-800 dark:text-orange-100",
    }
  }
  if (status === "pending_approval") {
    return {
      label: "En revisión",
      className:
        "border-sky-500/45 bg-sky-500/15 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-sky-800 dark:text-sky-200",
    }
  }
  if (status === "needs_revision") {
    return {
      label: "Pide cambios",
      className:
        "border-orange-500/45 bg-orange-500/15 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-orange-800 dark:text-orange-100",
    }
  }
  if (status === "rejected") {
    return {
      label: "Rechazado",
      className:
        "border-rose-500/45 bg-rose-500/15 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-rose-700 dark:text-rose-200",
    }
  }
  if (status === "draft") {
    return {
      label: "Borrador (No visible)",
      className:
        "border-amber-500/45 bg-amber-500/15 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-amber-800 dark:text-amber-100",
    }
  }
  if (status === "cancelled") {
    return {
      label: "Cancelado",
      className:
        "border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-rose-700 dark:text-rose-200",
    }
  }
  if (status === "archived") {
    return {
      label: "Archivado",
      className:
        "border-zinc-400/40 bg-zinc-500/10 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300",
    }
  }
  return {
    label: status,
    className:
      "border-zinc-300 px-3 py-1.5 text-sm font-bold uppercase tracking-wide dark:border-zinc-700",
  }
}

export function EventCommandHeader({
  eventId,
  title,
  subtitle,
  status,
  isSponsored,
  reviewNote,
}: EventCommandHeaderProps) {
  const router = useRouter()
  const [publishOpen, setPublishOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [copyingLink, setCopyingLink] = useState(false)
  const statusUi = statusPresentation(status)
  const canSubmit = canSubmitEventForReview(status)
  const awaitingReview = isPendingEventReview(status)
  const isPublished = status === "published"
  const isPaused = status === "paused"
  const previewHref = isSandboxEventStatus(status) || isPaused
    ? `/events/preview/${eventId}`
    : `/eventos/${eventId}`

  async function copyPreviewLink() {
    setCopyingLink(true)
    try {
      const result = await getOrganizerPreviewShareUrl(eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      await navigator.clipboard.writeText(result.url)
      toast.success("Enlace de prueba copiado")
    } catch {
      toast.error("No se pudo copiar el enlace de prueba.")
    } finally {
      setCopyingLink(false)
    }
  }

  function changeStatus(next: "published" | "paused" | "draft") {
    startTransition(async () => {
      const result = await updateEventSalesStatus(eventId, next)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      const messages = {
        published: "Evento publicado · ya está en venta",
        paused: "Evento pausado · oculto del catálogo",
        draft: "Evento en borrador",
      } as const
      toast.success(messages[next])
      router.refresh()
    })
  }

  return (
    <>
      <header className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge variant="outline" className={cn("rounded-full", statusUi.className)}>
                {statusUi.label}
              </Badge>
              {isSponsored ? (
                <Badge className="rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-900 dark:text-amber-100">
                  Auspiciado por TokePass
                </Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            {awaitingReview ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm leading-6 text-sky-950 dark:text-sky-100">
                <p className="font-semibold">{EVENT_SENT_TO_REVIEW_TITLE}</p>
                <p className="mt-1">{EVENT_SENT_TO_REVIEW_BODY}</p>
              </div>
            ) : null}
            {(status === "needs_revision" || status === "rejected") &&
            reviewNote?.trim() ? (
              <p className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm leading-6 text-orange-950 dark:text-orange-100">
                <span className="font-semibold">
                  {status === "rejected" ? "Motivo del rechazo: " : "Cambios pedidos: "}
                </span>
                {reviewNote.trim()}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              variant="outline"
              className="h-12 rounded-xl border-zinc-300 bg-white px-5 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              nativeButton={false}
              render={
                <Link
                  href={previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Eye className="size-4" aria-hidden="true" />
              Vista Previa
            </Button>

            {isSandboxEventStatus(status) ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-amber-500/40 bg-amber-500/10 px-5 text-amber-900 hover:bg-amber-500/20 dark:text-amber-100"
                onClick={() => void copyPreviewLink()}
                disabled={copyingLink}
              >
                {copyingLink ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 className="size-4" aria-hidden="true" />
                )}
                Copiar enlace de prueba
              </Button>
            ) : null}

            {canSubmit ? (
              <Button
                type="button"
                className="h-12 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white hover:bg-emerald-500 sm:min-w-[220px]"
                onClick={() => setPublishOpen(true)}
                disabled={isPending}
              >
                <Rocket className="size-4" aria-hidden="true" />
                Publicar Evento
              </Button>
            ) : null}

            {isPaused ? (
              <Button
                type="button"
                className="h-12 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white hover:bg-emerald-500"
                onClick={() => changeStatus("published")}
                disabled={isPending}
              >
                {isPending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Rocket className="size-4" aria-hidden="true" />
                )}
                Reanudar venta
              </Button>
            ) : null}

            {isPublished ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-orange-500/40 bg-orange-500/10 px-5 text-orange-800 hover:bg-orange-500/20 dark:text-orange-100"
                onClick={() => changeStatus("paused")}
                disabled={isPending}
              >
                {isPending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Pause className="size-4" aria-hidden="true" />
                )}
                Pausar evento
              </Button>
            ) : null}

            {isPublished || isPaused ? (
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-zinc-300 bg-white px-5 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                onClick={() => changeStatus("draft")}
                disabled={isPending}
              >
                <FilePenLine className="size-4" aria-hidden="true" />
                Poner en borrador
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <PublishEventConfirmDialog
        eventId={eventId}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={() => {
          router.refresh()
        }}
      />
    </>
  )
}
