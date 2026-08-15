"use client"

import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { EventFlyer } from "@/components/public/event-flyer"
import { hasGalleryEmbed } from "@/lib/promo-video"
import { cn, tapFeedbackClass } from "@/lib/utils"

const PromoVideoPlayer = dynamic(
  () =>
    import("@/components/public/promo-video-player").then(
      (mod) => mod.PromoVideoPlayer,
    ),
  { ssr: false },
)

export function EventHeroMediaGallery({
  eventId,
  title,
  imageUrl,
  promoVideoUrl,
  finished = false,
  actions,
  badge,
}: {
  eventId: string
  title: string
  imageUrl: string | null
  promoVideoUrl?: string | null
  finished?: boolean
  actions?: ReactNode
  badge?: ReactNode
}) {
  const hasVideo = useMemo(
    () => hasGalleryEmbed(promoVideoUrl),
    [promoVideoUrl],
  )
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    loop: false,
    duration: 20,
    watchDrag: hasVideo,
  })
  const [selected, setSelected] = useState(0)
  const [playerReady, setPlayerReady] = useState(false)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelected(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on("select", onSelect)
    emblaApi.on("reInit", onSelect)
    return () => {
      emblaApi.off("select", onSelect)
      emblaApi.off("reInit", onSelect)
    }
  }, [emblaApi, onSelect])

  const videoActive = hasVideo && selected === 1

  useEffect(() => {
    if (videoActive) setPlayerReady(true)
  }, [videoActive])

  return (
    <section aria-label="Galería multimedia del evento">
      <div className="relative aspect-video w-full overflow-hidden rounded-none bg-zinc-950 md:rounded-2xl">
        <div className="h-full overflow-hidden" ref={emblaRef}>
          <div className="flex h-full">
            <div className="min-w-0 shrink-0 grow-0 basis-full">
              <EventFlyer
                eventId={eventId}
                title={title}
                imageUrl={imageUrl}
                priority
                objectFit="cover"
                className={finished ? "grayscale-[50%]" : undefined}
              />
            </div>
            {hasVideo ? (
              <div className="relative h-full min-w-0 w-full shrink-0 grow-0 basis-full overflow-hidden bg-black">
                {playerReady ? (
                  <PromoVideoPlayer
                    url={promoVideoUrl}
                    fallbackImageUrl={imageUrl}
                    title={`Spot · ${title}`}
                    active={videoActive}
                    deferUntilActive
                    gallery
                    fill
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {hasVideo && selected === 1 ? (
          <button
            type="button"
            aria-label="Ver flyer"
            onClick={() => emblaApi?.scrollTo(0)}
            className={cn(
              tapFeedbackClass,
              "absolute top-1/2 left-3 z-[15] flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white shadow-sm backdrop-blur-md hover:bg-black/50",
            )}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
        ) : null}
        {hasVideo && selected === 0 ? (
          <button
            type="button"
            aria-label="Ver video"
            onClick={() => emblaApi?.scrollTo(1)}
            className={cn(
              tapFeedbackClass,
              "absolute top-1/2 right-3 z-[15] flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white shadow-sm backdrop-blur-md hover:bg-black/50",
            )}
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        ) : null}

        {badge ? (
          <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-1.5">
            {badge}
          </div>
        ) : null}

        {actions}
      </div>

      {hasVideo ? (
        <div
          className="flex items-center justify-center gap-2 py-3"
          role="tablist"
          aria-label="Slides de la galería"
        >
          {["Flyer", "Video"].map((label, index) => {
            const current = selected === index
            return (
              <button
                key={label}
                type="button"
                role="tab"
                aria-label={`Ver ${label.toLowerCase()}`}
                aria-selected={current}
                onClick={() => emblaApi?.scrollTo(index)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  current
                    ? "w-6 bg-foreground"
                    : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground/70",
                )}
              />
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
