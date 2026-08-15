"use client"

import { Play, X } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { parsePromoVideoUrl } from "@/lib/promo-video"
import { cn } from "@/lib/utils"

export function PromoVideoLightbox({
  url,
  title = "Spot del evento",
  open,
  onOpenChange,
}: {
  url: string | null | undefined
  title?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const parsed = useMemo(() => parsePromoVideoUrl(url), [url])
  if (!parsed) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/90 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex h-dvh w-screen flex-col outline-none">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <DialogTitle className="text-sm font-semibold text-white">
              {title}
            </DialogTitle>
            <DialogClose
              className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </DialogClose>
          </div>

          <div className="flex flex-1 items-center justify-center px-3 pb-6 sm:px-8">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg">
              {open ? (
                parsed.provider === "file" ? (
                  <video
                    key={parsed.embedUrl}
                    src={parsed.embedUrl}
                    autoPlay
                    muted
                    playsInline
                    loop
                    controls
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <iframe
                    key={parsed.embedUrl}
                    src={parsed.embedUrl}
                    title={title}
                    loading="eager"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full border-0"
                  />
                )
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

export function EventPromoSpotButton({
  promoVideoUrl,
  className,
}: {
  promoVideoUrl: string | null | undefined
  className?: string
}) {
  const parsed = useMemo(
    () => parsePromoVideoUrl(promoVideoUrl),
    [promoVideoUrl],
  )
  const [open, setOpen] = useState(false)

  if (!parsed) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 text-sm font-bold text-foreground transition",
          "hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        Ver Spot
      </button>
      <PromoVideoLightbox
        url={promoVideoUrl}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
