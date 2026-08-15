"use client"

import { Eye, Rocket, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import { Button } from "@/components/ui/button"

export function EventPreviewBanner({
  eventId,
  canPublish,
  status = "draft",
}: {
  eventId: string
  canPublish: boolean
  status?: string
}) {
  const router = useRouter()
  const [publishOpen, setPublishOpen] = useState(false)
  const statusHint =
    status === "paused"
      ? "El evento está pausado (oculto del catálogo)."
      : "Este evento no es público."

  return (
    <>
      <div className="sticky top-0 z-[70] border-b border-amber-500/35 bg-gradient-to-r from-amber-950 via-amber-900 to-amber-950 text-amber-50 shadow-[0_8px_30px_rgba(180,83,9,0.35)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/30">
              <TriangleAlert className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200/90">
                <Eye className="size-3.5" aria-hidden="true" />
                Modo previsualización
              </p>
              <p className="mt-1 text-sm leading-5 text-amber-50/90">
                {statusHint} Usá la compra de prueba (Modo Sandbox) para
                validar QR y puerta sin Mercado Pago. Quedan marcadas TEST.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-full border-amber-200/30 bg-black/20 text-amber-50 hover:bg-black/35"
              nativeButton={false}
              render={<Link href="/admin/events" />}
            >
              Volver a mis eventos
            </Button>
            {canPublish ? (
              <Button
                type="button"
                className="h-10 rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                onClick={() => setPublishOpen(true)}
              >
                <Rocket className="size-4" aria-hidden="true" />
                Publicar ahora
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <PublishEventConfirmDialog
        eventId={eventId}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onPublished={() => {
          router.push(`/events/${eventId}`)
          router.refresh()
        }}
      />
    </>
  )
}
