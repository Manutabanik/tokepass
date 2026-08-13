"use client"

import { Eye, Rocket } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type EventCommandHeaderProps = {
  eventId: string
  title: string
  subtitle: string
  status: string
  isSponsored: boolean
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
}: EventCommandHeaderProps) {
  const router = useRouter()
  const [publishOpen, setPublishOpen] = useState(false)
  const statusUi = statusPresentation(status)
  const isDraft = status === "draft"

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
                  Auspiciado por Tokepass
                </Badge>
              ) : null}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
              {title}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant="outline"
              className="h-12 rounded-xl border-zinc-300 bg-white px-5 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              nativeButton={false}
              render={
                <Link
                  href={`/events/${eventId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Eye className="size-4" aria-hidden="true" />
              Vista Previa
            </Button>

            {isDraft ? (
              <Button
                type="button"
                className="h-12 rounded-xl bg-emerald-600 px-6 text-base font-bold text-white hover:bg-emerald-500 sm:min-w-[220px]"
                onClick={() => setPublishOpen(true)}
              >
                <Rocket className="size-4" aria-hidden="true" />
                Publicar Evento
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
