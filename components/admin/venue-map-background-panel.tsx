"use client"

import { Image as ImageIcon, SlidersHorizontal } from "lucide-react"
import { useRef, useState } from "react"

import { uploadVenueSeatingBackground } from "@/app/actions/venues"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { InteractiveVenueMap } from "@/types/venue-map"

export function VenueMapBackgroundPanel({
  map,
  onChange,
}: {
  map: InteractiveVenueMap
  onChange: (patch: Partial<InteractiveVenueMap>) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="size-4 text-emerald-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">Foto aérea de fondo</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Cargá cualquier JPG o PNG del predio. Después trazás las zonas encima
        con el lápiz.
      </p>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">URL de la imagen</Label>
        <Input
          value={map.backgroundImage ?? ""}
          onChange={(event) =>
            onChange({ backgroundImage: event.target.value.trim() || null })
          }
          placeholder="https://..."
        />
      </div>
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full whitespace-normal"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Subiendo imagen..." : "Cargar foto (JPG o PNG)"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
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
            onChange({
              backgroundImage: result.data.url,
              backgroundOpacity: map.backgroundImage
                ? map.backgroundOpacity
                : 0.72,
              backgroundScale: map.backgroundScale || 1,
            })
          }}
        />
      </div>
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        Encaje sobre el predio
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">
          Opacidad ({Math.round((map.backgroundOpacity ?? 0.4) * 100)}%)
        </Label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((map.backgroundOpacity ?? 0.4) * 100)}
          onChange={(event) =>
            onChange({ backgroundOpacity: Number(event.target.value) / 100 })
          }
          className="w-full accent-emerald-500"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">
          Escala ({Math.round((map.backgroundScale ?? 1) * 100)}%)
        </Label>
        <input
          type="range"
          min={20}
          max={250}
          value={Math.round((map.backgroundScale ?? 1) * 100)}
          onChange={(event) =>
            onChange({ backgroundScale: Number(event.target.value) / 100 })
          }
          className="w-full accent-emerald-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Posición X</Label>
          <Input
            type="number"
            value={map.backgroundX ?? 0}
            onChange={(event) =>
              onChange({ backgroundX: Number(event.target.value) || 0 })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Posición Y</Label>
          <Input
            type="number"
            value={map.backgroundY ?? 0}
            onChange={(event) =>
              onChange({ backgroundY: Number(event.target.value) || 0 })
            }
          />
        </div>
      </div>
      {map.backgroundImage ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onChange({ backgroundImage: null })}
        >
          Quitar fondo
        </Button>
      ) : null}
    </div>
  )
}
