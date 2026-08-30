"use client"

import { ImageIcon, ImagePlus, Upload } from "lucide-react"
import { useRef, useState } from "react"

import { uploadVenueSeatingBackground } from "@/app/actions/venues"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  normalizeVenueMapBackgroundPatch,
  type VenueMapBackgroundPatch,
} from "@/lib/seating/venue-map-background"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap } from "@/types/venue-map"

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"

export function CanvasPropertiesInspector({
  map,
  onChange,
}: {
  map: InteractiveVenueMap | null | undefined
  onChange: (patch: VenueMapBackgroundPatch) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const opacity = Math.round((map?.backgroundOpacity ?? 0.4) * 100)
  const scale = Math.round((map?.backgroundScale ?? 1) * 100)
  const image = map?.backgroundImage?.trim() || null

  function emit(patch: VenueMapBackgroundPatch) {
    const next = normalizeVenueMapBackgroundPatch(map, patch)
    if (!next) return
    onChange(next)
  }

  async function uploadFile(file: File | undefined) {
    if (!file || !map) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.set("file", file)
    const result = await uploadVenueSeatingBackground(form)
    setBusy(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    emit({
      backgroundImage: result.data.url,
      backgroundOpacity: image ? map.backgroundOpacity : 0.72,
      backgroundScale: map.backgroundScale || 1,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ImageIcon className="size-4 text-emerald-500" aria-hidden="true" />
          Foto del recinto
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Subí el plano o una foto aérea. Después trazás zonas y butacas
          encima.
        </p>
      </div>

      <button
        type="button"
        disabled={busy || !map}
        onClick={() => fileRef.current?.click()}
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
          void uploadFile(event.dataTransfer.files?.[0])
        }}
        className={cn(
          "flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-center transition-colors",
          dragOver
            ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200"
            : "border-border bg-muted/40 text-muted-foreground hover:border-emerald-400/70 hover:bg-muted",
          (busy || !map) && "pointer-events-none opacity-60",
        )}
      >
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              className="max-h-16 w-auto rounded object-contain"
            />
            <span className="text-xs font-medium text-foreground">
              {busy ? "Subiendo imagen..." : "Cambiar foto de fondo"}
            </span>
          </>
        ) : (
          <>
            <ImagePlus className="size-6 text-emerald-500" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">
              {busy ? "Subiendo imagen..." : "Arrastrá una foto o hacé clic"}
            </span>
            <span className="text-xs">JPG, PNG o WEBP · máx. 3 MB</span>
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          void uploadFile(file)
        }}
      />
      {error ? <p className="text-xs text-rose-500">{error}</p> : null}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">URL de la imagen</Label>
        <Input
          value={image ?? ""}
          disabled={!map}
          onChange={(event) =>
            emit({ backgroundImage: event.target.value.trim() || null })
          }
          placeholder="https://..."
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Opacidad ({opacity}%)
        </Label>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          disabled={!map}
          aria-label="Opacidad del fondo"
          onChange={(event) =>
            emit({ backgroundOpacity: Number(event.target.value) / 100 })
          }
          className="w-full accent-emerald-500"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Escala ({scale}%)
        </Label>
        <input
          type="range"
          min={20}
          max={250}
          value={scale}
          disabled={!map}
          aria-label="Escala del fondo"
          onChange={(event) =>
            emit({ backgroundScale: Number(event.target.value) / 100 })
          }
          className="w-full accent-emerald-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Posición X</Label>
          <Input
            type="number"
            value={map?.backgroundX ?? 0}
            disabled={!map}
            onChange={(event) =>
              emit({ backgroundX: Number(event.target.value) || 0 })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Posición Y</Label>
          <Input
            type="number"
            value={map?.backgroundY ?? 0}
            disabled={!map}
            onChange={(event) =>
              emit({ backgroundY: Number(event.target.value) || 0 })
            }
          />
        </div>
      </div>

      {image ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => emit({ backgroundImage: null })}
        >
          Quitar fondo
        </Button>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Upload className="size-3.5" aria-hidden="true" />
          El lienzo sigue usable sin foto.
        </p>
      )}
    </div>
  )
}
