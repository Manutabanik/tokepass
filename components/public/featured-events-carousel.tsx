"use client"

import useEmblaCarousel from "embla-carousel-react"
import { ChevronLeft, ChevronRight, Star } from "lucide-react"
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

export function FeaturedEventsCarousel({
  pool,
  province = "todas",
  categories,
}: {
  pool: CatalogEvent[]
  province?: string
  categories?: DiscoveryCategory[]
}) {
  const slides = useMemo(() => {
    return pool
      .filter((event) => matchesFeaturedProvince(event, province))
      .slice(0, FEATURED_CAROUSEL_LIMIT)
  }, [pool, province])

  const canLoop = slides.length > 1
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: canLoop,
    skipSnaps: false,
    duration: 24,
  })
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  const updateButtons = useCallback(() => {
    if (!emblaApi) return
    setCanScrollPrev(emblaApi.canScrollPrev())
    setCanScrollNext(emblaApi.canScrollNext())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    const start = window.setTimeout(() => updateButtons(), 0)
    emblaApi.on("select", updateButtons)
    emblaApi.on("reInit", updateButtons)
    return () => {
      window.clearTimeout(start)
      emblaApi.off("select", updateButtons)
      emblaApi.off("reInit", updateButtons)
    }
  }, [emblaApi, updateButtons, slides.length])

  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev()
  }, [emblaApi])

  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext()
  }, [emblaApi])

  if (slides.length === 0) return null

  return (
    <section
      className="relative w-full overflow-visible bg-transparent py-8"
      aria-label="Eventos destacados"
    >
      <div className="mx-auto mb-5 flex w-[min(100%-2rem,80rem)] items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Destacados
            </h2>
          </div>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            Eventos con mayor visibilidad en TokePass
          </p>
        </div>
      </div>

      <div className="relative">
        <div className="overflow-visible" ref={emblaRef}>
          <div className="flex touch-pan-y">
            {slides.map((event, index) => (
              <div
                key={event.id}
                className={cn(
                  "min-w-0 shrink-0 grow-0",
                  slides.length === 1
                    ? "basis-full"
                    : "basis-[90%] sm:basis-[86%] lg:basis-[82%]",
                )}
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={scrollPrev}
              disabled={!canScrollPrev && !canLoop}
              className={cn(
                "absolute top-1/2 left-2 z-30 size-11 -translate-y-1/2 rounded-full border-border bg-background/80 shadow-xl backdrop-blur-md hover:bg-background",
              )}
              aria-label="Evento destacado anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={scrollNext}
              disabled={!canScrollNext && !canLoop}
              className={cn(
                "absolute top-1/2 right-2 z-30 size-11 -translate-y-1/2 rounded-full border-border bg-background/80 shadow-xl backdrop-blur-md hover:bg-background",
              )}
              aria-label="Siguiente evento destacado"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        ) : null}
      </div>
    </section>
  )
}
