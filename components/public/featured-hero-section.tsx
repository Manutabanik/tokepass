"use client"

import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { FeaturedBannerCard } from "@/components/public/featured-banner-card"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import {
  FEATURED_CAROUSEL_LIMIT,
  matchesFeaturedProvince,
} from "@/lib/featured-rotation"
import { cn } from "@/lib/utils"

const AUTOPLAY_MS = 5000

export function FeaturedHeroSection({
  pool,
  province = "todas",
  categories,
}: {
  pool: CatalogEvent[]
  province?: string
  categories?: DiscoveryCategory[]
}) {
  const reduceMotion = useReducedMotion()
  const slides = useMemo(() => {
    return pool
      .filter((event) => matchesFeaturedProvince(event, province))
      .slice(0, FEATURED_CAROUSEL_LIMIT)
  }, [pool, province])

  const canLoop = slides.length > 1
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    loop: canLoop,
    skipSnaps: false,
    duration: 22,
  })
  const [selected, setSelected] = useState(0)
  const [progress, setProgress] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const paused = hovered || interacting

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelected(emblaApi.selectedScrollSnap())
    setProgress(0)
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    const start = window.setTimeout(() => onSelect(), 0)
    emblaApi.on("select", onSelect)
    emblaApi.on("reInit", onSelect)
    return () => {
      window.clearTimeout(start)
      emblaApi.off("select", onSelect)
      emblaApi.off("reInit", onSelect)
    }
  }, [emblaApi, onSelect, slides.length])

  useEffect(() => {
    if (!emblaApi || !canLoop) return
    const onPointerDown = () => setInteracting(true)
    const onPointerUp = () => setInteracting(false)
    emblaApi.on("pointerDown", onPointerDown)
    emblaApi.on("pointerUp", onPointerUp)
    return () => {
      emblaApi.off("pointerDown", onPointerDown)
      emblaApi.off("pointerUp", onPointerUp)
    }
  }, [emblaApi, canLoop])

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

  return (
    <section
      className="relative my-4 w-full max-w-full bg-transparent p-0"
      aria-label="Eventos destacados"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setHovered(false)
        }
      }}
    >
      <div className="relative">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex touch-pan-y">
            {slides.map((event, index) => (
              <div
                key={event.id}
                className="min-w-0 flex-[0_0_100%]"
              >
                <FeaturedBannerCard
                  event={event}
                  priority={index === 0}
                  categories={categories}
                />
              </div>
            ))}
          </div>
        </div>

        {canLoop ? (
          <>
            <button
              type="button"
              onClick={scrollPrev}
              className="absolute top-1/2 left-2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-900 shadow-sm backdrop-blur-md transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-white dark:shadow-none dark:hover:bg-zinc-900 md:flex"
              aria-label="Evento anterior"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              className="absolute top-1/2 right-2 z-30 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-900 shadow-sm backdrop-blur-md transition hover:bg-white dark:border-zinc-700 dark:bg-zinc-950/80 dark:text-white dark:shadow-none dark:hover:bg-zinc-900 md:flex"
              aria-label="Siguiente evento"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
      </div>

      {canLoop ? (
        <div
          className="mt-5 flex items-center justify-center gap-2"
          role="tablist"
          aria-label="Eventos del carrusel"
        >
          {slides.map((event, index) => {
            const isActive = index === selected
            return (
              <button
                key={event.id}
                type="button"
                role="tab"
                aria-label={`Ir a ${event.title}`}
                aria-current={isActive}
                onClick={() => emblaApi?.scrollTo(index)}
                className={cn(
                  "overflow-hidden rounded-full transition-all duration-300",
                  isActive
                    ? "h-1.5 w-8 bg-foreground/15"
                    : "size-1.5 bg-foreground/30 hover:bg-foreground/55",
                )}
              >
                {isActive ? (
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{
                      width:
                        reduceMotion || paused
                          ? "100%"
                          : `${Math.round(progress * 100)}%`,
                    }}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
