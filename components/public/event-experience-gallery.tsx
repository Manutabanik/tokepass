"use client"

import { Images, X } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

export function EventExperienceGallery({ urls }: { urls: string[] }) {
  const photos = urls.filter(Boolean).slice(0, 4)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null,
  )
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedImageIndex == null) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedImageIndex(null)
    }

    window.addEventListener("keydown", onKeyDown)
    const frame = window.requestAnimationFrame(() => {
      const slide = scrollerRef.current?.children[selectedImageIndex] as
        | HTMLElement
        | undefined
      slide?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "instant",
      })
    })

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
      window.cancelAnimationFrame(frame)
    }
  }, [selectedImageIndex])

  if (photos.length === 0) return null

  const lightbox =
    selectedImageIndex !== null && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Galería de la experiencia"
            className="fixed inset-0 z-[100] flex flex-col bg-black/95"
          >
            <button
              type="button"
              aria-label="Cerrar galería"
              onClick={() => setSelectedImageIndex(null)}
              className="absolute top-4 right-4 z-50 p-2 text-white"
            >
              <X className="size-6" aria-hidden="true" />
            </button>
            <div
              ref={scrollerRef}
              className="hide-scrollbar flex min-h-0 flex-1 overflow-x-auto snap-x snap-mandatory"
            >
              {photos.map((url, index) => (
                <div
                  key={url}
                  className="flex h-full min-w-full snap-center items-center justify-center p-4"
                >
                  <Image
                    src={url}
                    alt={`Experiencia ${index + 1} de ${photos.length}`}
                    width={1600}
                    height={1200}
                    className="max-h-full max-w-full object-contain"
                    priority={index === selectedImageIndex}
                  />
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <section className="space-y-4" aria-labelledby="experience-gallery-title">
      <div className="flex items-center gap-2">
        <Images className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2
          id="experience-gallery-title"
          className="text-lg font-bold tracking-tight text-foreground"
        >
          La Experiencia
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Miradas del evento · sin frenar tu compra.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {photos.map((url, index) => (
          <button
            key={url}
            type="button"
            onClick={() => setSelectedImageIndex(index)}
            className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted"
            aria-label={`Abrir foto ${index + 1} de la experiencia`}
          >
            <Image
              src={url}
              alt={`Galería del evento ${index + 1}`}
              fill
              sizes="(max-width: 768px) 50vw, 320px"
              loading="lazy"
              className="object-cover"
            />
          </button>
        ))}
      </div>
      {lightbox}
    </section>
  )
}
