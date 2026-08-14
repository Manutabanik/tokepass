"use client"

import { Image as ImageIcon } from "lucide-react"
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
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <ImageIcon className="size-4 text-emerald-400" />
        <p className="text-sm font-semibold text-foreground">Mapa aéreo de fondo</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        PNG o WEBP hasta 3 MB, o una URL. Ajusta opacidad, escala y posicion para
        calzar las graderías sobre el predio real.
      </p>
      <div className="space-y-1">
        <Label className="text-[11px] text-zinc-500">URL de la imagen</Label>
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
          {busy ? "Subiendo imagen..." : "Cargar mapa aéreo (PNG o WEBP)"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp"
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
            onChange({ backgroundImage: result.data.url })
          }}
        />
      </div>
      {busy ? (
        <p className="text-xs text-muted-foreground">Subiendo imagen...</p>
      ) : null}
      {error ? <p className="text-xs text-rose-400">{error}</p> : null}
      <div className="space-y-1">
        <Label className="text-[11px] text-zinc-500">
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
        <Label className="text-[11px] text-zinc-500">
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
          <Label className="text-[11px] text-zinc-500">Posición X</Label>
          <Input
            type="number"
            value={map.backgroundX ?? 0}
            onChange={(event) =>
              onChange({ backgroundX: Number(event.target.value) || 0 })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-zinc-500">Posición Y</Label>
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
