"use client"

import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"

import type { CatalogEvent } from "@/app/actions/public-events"
import { FeaturedBannerCard } from "@/components/public/featured-banner-card"
import type { DiscoveryCategory } from "@/lib/discovery-categories"
import { Button } from "@/components/ui/button"
import {
  FEATURED_CAROUSEL_LIMIT,
  matchesFeaturedProvince,
} from "@/lib/featured-rotation"
import { cn } from "@/lib/utils"

const AUTOPLAY_MS = 6500

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
      className="relative w-full overflow-visible bg-transparent py-8"
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
      <div className="overflow-visible" ref={emblaRef}>
        <div className="flex">
          {slides.map((event, index) => (
            <div
              key={event.id}
              className="min-w-0 shrink-0 grow-0 basis-full"
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
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={scrollPrev}
            className="size-10 rounded-full border-border bg-card"
            aria-label="Evento anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex max-w-xs flex-1 gap-1.5">
            {slides.map((event, index) => (
              <button
                key={event.id}
                type="button"
                aria-label={`Ir a ${event.title}`}
                aria-current={index === selected}
                onClick={() => emblaApi?.scrollTo(index)}
                className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className={cn(
                    "block h-full rounded-full bg-emerald-500 transition-all duration-300",
                  )}
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={scrollNext}
            className="size-10 rounded-full border-border bg-card"
            aria-label="Siguiente evento"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
    </section>
  )
}
