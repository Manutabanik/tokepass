"use client"

import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight, Play } from "lucide-react"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useState } from "react"

import { EventFlyer } from "@/components/public/event-flyer"
import { hasGalleryEmbed } from "@/lib/promo-video"
import { cn } from "@/lib/utils"

const PromoVideoPlayer = dynamic(
  () =>
    import("@/components/public/promo-video-player").then(
      (mod) => mod.PromoVideoPlayer,
    ),
  { ssr: false },
)

const arrowClassName =
  "absolute top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition-all hover:bg-black/60"

function HeroFlyerSlide({
  url,
  title,
  finished = false,
}: {
  url: string
  title: string
  finished?: boolean
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- flyer host/blob */}
      <img
        key={url}
        src={url}
        alt={title}
        className={cn(
          "h-full w-full object-cover transition-all duration-300",
          finished && "grayscale-[50%]",
        )}
      />
    </div>
  )
}

export function EventHeroMediaGallery({
  eventId,
  title,
  imageUrl,
  promoVideoUrl,
  finished = false,
}: {
  eventId: string
  title: string
  imageUrl: string | null
  promoVideoUrl?: string | null
  finished?: boolean
}) {
  const flyerUrls = useMemo(
    () => (imageUrl?.trim() ? [imageUrl.trim()] : []),
    [imageUrl],
  )
  const hasVideo = useMemo(
    () => hasGalleryEmbed(promoVideoUrl),
    [promoVideoUrl],
  )
  const imageSlideCount = Math.max(flyerUrls.length, 1)
  const slideCount = imageSlideCount + (hasVideo ? 1 : 0)
  const showControls = slideCount > 1
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    loop: showControls,
    dragFree: false,
    duration: 20,
    watchDrag: showControls,
    skipSnaps: false,
  })
  const [selected, setSelected] = useState(0)
  const [wantsPlay, setWantsPlay] = useState(false)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    const index = emblaApi.selectedScrollSnap()
    setSelected(index)
    if (index < imageSlideCount) setWantsPlay(false)
  }, [emblaApi, imageSlideCount])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.on("select", onSelect)
    emblaApi.on("reInit", onSelect)
    return () => {
      emblaApi.off("select", onSelect)
      emblaApi.off("reInit", onSelect)
    }
  }, [emblaApi, onSelect])

  const videoIndex = hasVideo ? imageSlideCount : -1
  const videoActive = hasVideo && selected === videoIndex
  const currentFlyerUrl = flyerUrls[selected] ?? flyerUrls[0] ?? imageUrl

  const goPrev = useCallback(() => {
    setWantsPlay(false)
    emblaApi?.scrollPrev()
  }, [emblaApi])

  const goNext = useCallback(() => {
    if (selected === videoIndex) setWantsPlay(false)
    emblaApi?.scrollNext()
  }, [emblaApi, selected, videoIndex])

  const goTo = useCallback(
    (index: number) => {
      if (index !== videoIndex) setWantsPlay(false)
      emblaApi?.scrollTo(index)
    },
    [emblaApi, videoIndex],
  )

  return (
    <section
      aria-label="Galería multimedia del evento"
      className="w-full max-w-full overflow-x-hidden"
    >
      <div className="relative aspect-[4/3] w-full max-w-full max-h-[38dvh] overflow-hidden bg-slate-950 sm:aspect-[16/9] sm:max-h-[460px] md:rounded-2xl">
        <div
          className="no-scrollbar h-full snap-x snap-mandatory overflow-x-auto touch-pan-x select-none"
          ref={emblaRef}
        >
          <div className="flex h-full transform-gpu will-change-transform">
            {flyerUrls.length > 0 ? (
              flyerUrls.map((url) => (
                <div
                  key={url}
                  className="min-w-0 shrink-0 grow-0 basis-full snap-start"
                >
                  <HeroFlyerSlide
                    url={url}
                    title={title}
                    finished={finished}
                  />
                </div>
              ))
            ) : (
              <div className="min-w-0 shrink-0 grow-0 basis-full snap-start">
                <EventFlyer
                  eventId={eventId}
                  title={title}
                  imageUrl={null}
                  priority
                  sizes="100vw"
                  objectFit="contain"
                />
              </div>
            )}
            {hasVideo ? (
              <div className="relative h-full min-w-0 w-full shrink-0 grow-0 basis-full snap-start overflow-hidden bg-slate-950">
                {wantsPlay ? (
                  <>
                    <PromoVideoPlayer
                      url={promoVideoUrl}
                      fallbackImageUrl={imageUrl}
                      title={`Spot · ${title}`}
                      active={videoActive}
                      gallery
                      fill
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 z-30 w-[15%] touch-pan-x"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 right-0 z-30 w-[15%] touch-pan-x"
                    />
                  </>
                ) : currentFlyerUrl ? (
                  <>
                    <HeroFlyerSlide
                      url={currentFlyerUrl}
                      title={title}
                      finished={finished}
                    />
                    <button
                      type="button"
                      aria-label="Reproducir video"
                      onClick={() => setWantsPlay(true)}
                      className="absolute top-1/2 left-1/2 z-[5] flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:bg-black/60"
                    >
                      <Play className="size-7 fill-white" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <EventFlyer
                      eventId={`${eventId}-spot`}
                      title={title}
                      imageUrl={imageUrl}
                      sizes="100vw"
                      objectFit="cover"
                    />
                    <button
                      type="button"
                      aria-label="Reproducir video"
                      onClick={() => setWantsPlay(true)}
                      className="absolute top-1/2 left-1/2 z-[5] flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:bg-black/60"
                    >
                      <Play className="size-7 fill-white" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {showControls ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Diapositiva anterior"
              className={cn(arrowClassName, "left-3")}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Diapositiva siguiente"
              className={cn(arrowClassName, "right-3")}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
            <div className="pointer-events-auto absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-2">
              {Array.from({ length: slideCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Ir a la diapositiva ${index + 1}`}
                  aria-current={selected === index}
                  onClick={() => goTo(index)}
                  className={cn(
                    "size-2.5 rounded-full border border-white/40 transition",
                    selected === index
                      ? "bg-white"
                      : "bg-white/35 hover:bg-white/70",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
