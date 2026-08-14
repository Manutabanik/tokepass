"use client"

import useEmblaCarousel from "embla-carousel-react"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Sparkles,
  Ticket,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { Button } from "@/components/ui/button"
import { eventCityLabel } from "@/lib/discovery-filters"
import {
  FEATURED_CAROUSEL_LIMIT,
  matchesFeaturedProvince,
} from "@/lib/featured-rotation"
import { formatDiscoveryDateTime } from "@/lib/format"
import { publicEventPath } from "@/lib/seo/site"
import { cn } from "@/lib/utils"

const AUTOPLAY_MS = 6500
const WIDE_ART_RATIO = 1.65

function FeaturedHeroArtwork({
  src,
  alt,
  priority,
}: {
  src: string | null
  alt: string
  priority?: boolean
}) {
  const [needsAmbient, setNeedsAmbient] = useState(Boolean(src))

  return (
    <>
      {src && needsAmbient ? (
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-3xl"
          style={{ backgroundImage: `url(${src})` }}
          aria-hidden
        />
      ) : (
        <div
          className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-emerald-950/40 to-zinc-900"
          aria-hidden
        />
      )}
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, 1280px"
          className={cn(
            "object-center transition-transform duration-700 group-hover:scale-[1.03]",
            needsAmbient ? "object-contain" : "object-cover",
          )}
          onLoad={(event) => {
            const img = event.currentTarget
            const ratio = img.naturalWidth / Math.max(img.naturalHeight, 1)
            setNeedsAmbient(ratio < WIDE_ART_RATIO)
          }}
        />
      ) : null}
    </>
  )
}

export function FeaturedHeroSection({
  pool,
  province = "todas",
}: {
  pool: CatalogEvent[]
  province?: string
}) {
  const reduceMotion = useReducedMotion()
  const slides = useMemo(() => {
    return pool
      .filter((event) => matchesFeaturedProvince(event, province))
      .slice(0, FEATURED_CAROUSEL_LIMIT)
  }, [pool, province])

  const canLoop = slides.length > 1
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: canLoop,
    duration: 22,
  })
  const [selected, setSelected] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelected(emblaApi.selectedScrollSnap())
    setProgress(0)
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
  }, [emblaApi, onSelect, slides.length])

  useEffect(() => {
    if (!canLoop || paused || reduceMotion) return

    let frame = 0
    const started = performance.now()

    const tick = (now: number) => {
      const next = Math.min(1, (now - started) / AUTOPLAY_MS)
      setProgress(next)
      if (next >= 1) {
        emblaApi?.scrollNext()
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [canLoop, paused, reduceMotion, selected, emblaApi])

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])

  if (slides.length === 0) return null

  const active = slides[selected] ?? slides[0]
  const placeLabel = active?.venueName ?? active?.location ?? ""
  const cityLabel = active ? eventCityLabel(active) : ""

  return (
    <section
      className="relative mx-auto w-full max-w-7xl px-4 py-8"
      aria-label="Eventos destacados"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false)
        }
      }}
    >
      <div className="group relative aspect-[16/9] w-full overflow-hidden rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] md:aspect-[21/9]">
        <div className="h-full overflow-hidden" ref={emblaRef}>
          <div className="flex h-full">
            {slides.map((event, index) => (
              <div
                key={event.id}
                className="relative min-w-0 shrink-0 grow-0 basis-full"
              >
                <FeaturedHeroArtwork
                  src={event.imageUrl}
                  alt={event.title}
                  priority={index === 0}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold tracking-widest text-emerald-400 uppercase shadow-lg backdrop-blur-xl sm:top-6 sm:left-6">
          <Sparkles className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
          Destacado
        </div>

        {canLoop ? (
          <>
            <button
              type="button"
              onClick={scrollPrev}
              className="absolute top-1/2 left-2 z-30 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition hover:bg-black/80 sm:left-3 sm:size-11"
              aria-label="Evento anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              className="absolute top-1/2 right-2 z-30 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white backdrop-blur-md transition hover:bg-black/80 sm:right-3 sm:size-11"
              aria-label="Siguiente evento"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}

        {active ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="absolute inset-x-3 bottom-3 z-20 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/60 p-4 shadow-2xl backdrop-blur-2xl sm:inset-x-6 sm:bottom-6 md:flex-row md:items-center md:justify-between md:p-6"
            >
              {canLoop ? (
                <div className="absolute inset-x-4 top-2 flex gap-1.5 md:inset-x-6">
                  {slides.map((event, index) => (
                    <button
                      key={event.id}
                      type="button"
                      aria-label={`Ir a ${event.title}`}
                      aria-current={index === selected}
                      onClick={() => emblaApi?.scrollTo(index)}
                      className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20"
                    >
                      <span
                        className="block h-full rounded-full bg-emerald-400 transition-all duration-300"
                        style={{
                          width:
                            index < selected
                              ? "100%"
                              : index === selected
                                ? `${Math.round(progress * 100)}%`
                                : "0%",
                        }}
                      />
                    </button>
                  ))}
                </div>
              ) : null}

              <div className={cn("min-w-0", canLoop && "pt-2")}>
                <h2 className="text-xl font-black tracking-tight text-white md:text-3xl">
                  {active.title}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 md:text-sm">
                    <Calendar className="h-4 w-4 text-emerald-400" />
                    {formatDiscoveryDateTime(active.date)}
                  </span>
                  <span className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 md:text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span className="truncate">
                      {placeLabel}
                      {cityLabel && cityLabel !== placeLabel
                        ? ` · ${cityLabel}`
                        : ""}
                    </span>
                  </span>
                </div>
              </div>

              <Button
                size="lg"
                className="h-11 shrink-0 rounded-xl bg-emerald-500 px-6 font-extrabold text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all hover:scale-105 hover:bg-emerald-400"
                render={<Link href={publicEventPath(active)} />}
              >
                Conseguí tus entradas
                <Ticket className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </section>
  )
}
