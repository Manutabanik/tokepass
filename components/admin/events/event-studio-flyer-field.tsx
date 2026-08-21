"use client"

import { ImagePlus, Trash2, Upload } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormMessage } from "@/components/ui/form"
import { MAX_EVENT_FLYER_BYTES } from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

const FLYER_ACCEPT = "image/png,image/jpeg,image/webp"
const CROP_ASPECT = 4 / 5
const CROP_VIEW_WIDTH = 280
const CROP_VIEW_HEIGHT = Math.round(CROP_VIEW_WIDTH / CROP_ASPECT)
const CROP_OUTPUT_WIDTH = 1200

function coverScale(naturalWidth: number, naturalHeight: number) {
  return Math.max(
    CROP_VIEW_WIDTH / naturalWidth,
    CROP_VIEW_HEIGHT / naturalHeight,
  )
}

function clampOffset(
  offset: { x: number; y: number },
  naturalWidth: number,
  naturalHeight: number,
  zoom: number,
) {
  const scale = coverScale(naturalWidth, naturalHeight) * zoom
  const displayedWidth = naturalWidth * scale
  const displayedHeight = naturalHeight * scale
  return {
    x: Math.min(0, Math.max(CROP_VIEW_WIDTH - displayedWidth, offset.x)),
    y: Math.min(0, Math.max(CROP_VIEW_HEIGHT - displayedHeight, offset.y)),
  }
}

async function cropFlyerFile(
  source: HTMLImageElement,
  offset: { x: number; y: number },
  zoom: number,
  fileName: string,
) {
  const scale = coverScale(source.naturalWidth, source.naturalHeight) * zoom
  const sx = -offset.x / scale
  const sy = -offset.y / scale
  const sw = CROP_VIEW_WIDTH / scale
  const sh = CROP_VIEW_HEIGHT / scale
  const canvas = document.createElement("canvas")
  canvas.width = CROP_OUTPUT_WIDTH
  canvas.height = Math.round(CROP_OUTPUT_WIDTH / CROP_ASPECT)
  const context = canvas.getContext("2d")
  if (!context) throw new Error("No se pudo recortar el flyer.")
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("Recorte vacio."))),
      "image/jpeg",
      0.88,
    )
  })
  const base = fileName.replace(/\.[^.]+$/, "") || "flyer"
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" })
}

function FlyerCropDialog({
  open,
  sourceUrl,
  fileName,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  sourceUrl: string
  fileName: string
  onOpenChange: (open: boolean) => void
  onConfirm: (file: File) => void
}) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    pointerX: number
    pointerY: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [busy, setBusy] = useState(false)
  const ready = natural.width > 0 && natural.height > 0

  function resetFrame(image: HTMLImageElement) {
    const nextZoom = 1
    const scale = coverScale(image.naturalWidth, image.naturalHeight) * nextZoom
    setZoom(nextZoom)
    setNatural({ width: image.naturalWidth, height: image.naturalHeight })
    setOffset(
      clampOffset(
        {
          x: (CROP_VIEW_WIDTH - image.naturalWidth * scale) / 2,
          y: (CROP_VIEW_HEIGHT - image.naturalHeight * scale) / 2,
        },
        image.naturalWidth,
        image.naturalHeight,
        nextZoom,
      ),
    )
  }

  async function confirmCrop() {
    const image = imageRef.current
    if (!image) return
    setBusy(true)
    try {
      const file = await cropFlyerFile(image, offset, zoom, fileName)
      onConfirm(file)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setNatural({ width: 0, height: 0 })
          setBusy(false)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recortar flyer</DialogTitle>
          <DialogDescription>
            Arrastra la imagen y ajusta el zoom. El recorte sigue el formato
            del celular.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-border"
            style={{ width: CROP_VIEW_WIDTH, height: CROP_VIEW_HEIGHT }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              dragRef.current = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                offsetX: offset.x,
                offsetY: offset.y,
              }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              const image = imageRef.current
              if (!drag || !image) return
              setOffset(
                clampOffset(
                  {
                    x: drag.offsetX + (event.clientX - drag.pointerX),
                    y: drag.offsetY + (event.clientY - drag.pointerY),
                  },
                  image.naturalWidth,
                  image.naturalHeight,
                  zoom,
                ),
              )
            }}
            onPointerUp={() => {
              dragRef.current = null
            }}
            onPointerCancel={() => {
              dragRef.current = null
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- crop source */}
            <img
              ref={imageRef}
              src={sourceUrl}
              alt=""
              draggable={false}
              onLoad={(event) => resetFrame(event.currentTarget)}
              className="absolute top-0 left-0 max-w-none select-none"
              style={
                ready
                  ? {
                      width:
                        natural.width *
                        coverScale(natural.width, natural.height) *
                        zoom,
                      height:
                        natural.height *
                        coverScale(natural.width, natural.height) *
                        zoom,
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                    }
                  : undefined
              }
            />
          </div>
          <label className="flex w-full flex-col gap-2 text-xs font-medium text-muted-foreground">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => {
                const image = imageRef.current
                const nextZoom = Number(event.target.value)
                setZoom(nextZoom)
                if (!image) return
                setOffset(
                  clampOffset(
                    offset,
                    image.naturalWidth,
                    image.naturalHeight,
                    nextZoom,
                  ),
                )
              }}
              className="w-full accent-emerald-500"
            />
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="text-base md:text-sm"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!ready || busy}
            onClick={() => void confirmCrop()}
            className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-base font-semibold text-zinc-950 hover:from-emerald-400 hover:to-cyan-400 md:text-sm"
          >
            {busy ? "Recortando..." : "Usar recorte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EventStudioFlyerField({
  flyerFile,
  existingFlyerUrl,
  existingTitle,
  error,
  onFile,
  onClear,
}: {
  flyerFile: File | null
  existingFlyerUrl: string | null
  existingTitle?: string
  error?: string
  onFile: (file: File) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [cropSource, setCropSource] = useState<{
    url: string
    name: string
  } | null>(null)

  const localPreview = useMemo(
    () => (flyerFile ? URL.createObjectURL(flyerFile) : null),
    [flyerFile],
  )
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  const previewUrl = localPreview ?? existingFlyerUrl
  const hasPreview = Boolean(previewUrl)

  function validateAndCrop(file: File | null) {
    if (!file) return
    if (!FLYER_ACCEPT.split(",").includes(file.type)) {
      setLocalError("El flyer debe ser PNG, JPG o WEBP.")
      return
    }
    if (file.size > MAX_EVENT_FLYER_BYTES) {
      setLocalError("El flyer supera los 5MB. Comprimilo o elegi otra imagen.")
      return
    }
    setLocalError(null)
    setCropSource({ url: URL.createObjectURL(file), name: file.name })
  }

  return (
    <div className="space-y-3">
      <p className="block font-mono text-xs font-semibold tracking-wider text-foreground uppercase">
        Flyer principal
      </p>
      <input
        ref={inputRef}
        id="event-flyer"
        type="file"
        accept={FLYER_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          validateAndCrop(event.target.files?.[0] ?? null)
          event.target.value = ""
        }}
      />

      {hasPreview ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-zinc-950">
          <div className="relative aspect-[4/5] w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- flyer host/blob */}
            <img
              src={previewUrl ?? ""}
              alt={
                existingTitle
                  ? `Flyer de ${existingTitle}`
                  : "Flyer del evento"
              }
              className="absolute inset-0 size-full object-cover"
            />
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 p-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              className="min-h-11 flex-1 text-base md:text-sm"
            >
              <Upload />
              Cambiar imagen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setLocalError(null)
                onClear()
              }}
              className="min-h-11 text-base md:text-sm"
            >
              <Trash2 />
              Eliminar
            </Button>
          </div>
        </div>
      ) : (
        <div
          data-field="basics.flyerName"
          onDragEnter={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            validateAndCrop(event.dataTransfer.files?.[0] ?? null)
          }}
          className={cn(
            "flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition",
            dragOver
              ? "border-emerald-400 bg-emerald-500/10"
              : "border-border/80 bg-card/40 hover:border-emerald-500/40 hover:bg-card",
          )}
        >
          <span className="grid size-14 place-items-center rounded-2xl border border-border bg-background text-emerald-500">
            <ImagePlus className="size-6" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Arrastra el flyer aca
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG o WEBP. Maximo 5MB. Recorte 4:5.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="min-h-11 bg-gradient-to-r from-emerald-500 to-cyan-500 text-base font-semibold text-zinc-950 hover:from-emerald-400 hover:to-cyan-400 md:text-sm"
          >
            <Upload />
            Subir imagen
          </Button>
        </div>
      )}

      {(localError || error) && (
        <FormMessage>{localError ?? error}</FormMessage>
      )}

      {cropSource ? (
        <FlyerCropDialog
          open
          sourceUrl={cropSource.url}
          fileName={cropSource.name}
          onOpenChange={(open) => {
            if (!open) {
              URL.revokeObjectURL(cropSource.url)
              setCropSource(null)
            }
          }}
          onConfirm={(file) => {
            URL.revokeObjectURL(cropSource.url)
            setCropSource(null)
            onFile(file)
          }}
        />
      ) : null}
    </div>
  )
}
