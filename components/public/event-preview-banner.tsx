"use client"

import { Rocket } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  canSubmitEventForReview,
  EVENT_SENT_TO_REVIEW_TITLE,
  isPendingEventReview,
} from "@/lib/events/review-status"

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
  const paused = status === "paused"
  const awaitingReview = isPendingEventReview(status)
  const needsRevision = status === "needs_revision"
  const showPublish = canPublish && canSubmitEventForReview(status)

  return (
    <>
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">
            {paused
              ? "El evento está pausado (oculto del catálogo)."
              : awaitingReview
                ? EVENT_SENT_TO_REVIEW_TITLE
                : needsRevision
                  ? "TokePass pidió cambios. Editá el evento y volvé a enviarlo a revisión."
                  : status === "rejected"
                    ? "Este evento fue rechazado. Editá los datos y volvé a enviarlo a revisión."
                  : "Vista previa de organizador. El aviso de modo de prueba aparece arriba."}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 rounded-full"
              nativeButton={false}
              render={<Link href="/admin/events" />}
            >
              Volver a mis eventos
            </Button>
            {showPublish ? (
              <Button
                type="button"
                className="h-10 rounded-full bg-emerald-500 text-white hover:bg-emerald-400"
                onClick={() => setPublishOpen(true)}
              >
                <Rocket className="size-4" aria-hidden="true" />
                Publicar Evento
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
          router.refresh()
        }}
      />
    </>
  )
}
