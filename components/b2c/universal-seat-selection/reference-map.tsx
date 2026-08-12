"use client"

import { Expand, Shrink, Map } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function UniversalReferenceMap({
  imageUrl,
  alt = "Mapa del lugar",
  highlightedColor,
}: {
  imageUrl?: string | null
  alt?: string
  highlightedColor?: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  const frame = (
    <div
      className={cn(
        "relative overflow-hidden bg-zinc-900",
        expanded
          ? "h-full w-full"
          : "aspect-[16/9] w-full rounded-2xl border border-zinc-800",
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={alt}
          fill
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 720px"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_center,rgba(39,39,42,0.9),#09090b_70%)]">
          <span className="grid size-14 place-items-center rounded-2xl border border-zinc-700 bg-zinc-950 text-zinc-400">
            <Map className="size-6" aria-hidden="true" />
          </span>
          <p className="max-w-[14rem] text-center text-sm text-zinc-500">
            Imagen o mapa del lugar
          </p>
          {highlightedColor ? (
            <span
              className="mt-1 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] font-semibold text-zinc-200"
              style={{ boxShadow: `0 0 0 1px ${highlightedColor}55` }}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: highlightedColor }}
              />
              Zona activa
            </span>
          ) : null}
        </div>
      )}

      <Button
        type="button"
        size="icon"
        aria-label={expanded ? "Cerrar vista completa" : "Expandir mapa"}
        className="absolute right-3 top-3 z-10 size-10 rounded-full border-0 bg-black/55 text-white shadow-lg backdrop-blur-md hover:bg-black/70"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <Shrink className="size-4" aria-hidden="true" />
        ) : (
          <Expand className="size-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  )

  return (
    <>
      {frame}
      {expanded ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-950/95 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">
                Vista completa del mapa
              </p>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-zinc-700"
                onClick={() => setExpanded(false)}
              >
                <Shrink className="size-4" aria-hidden="true" />
                Cerrar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-800">
              {imageUrl ? (
                <div className="relative h-full w-full bg-zinc-900">
                  <Image
                    src={imageUrl}
                    alt={alt}
                    fill
                    className="object-contain"
                    sizes="100vw"
                  />
                </div>
              ) : (
                <div className="grid h-full place-items-center bg-zinc-900 text-sm text-zinc-500">
                  Todavía no hay imagen del lugar
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
