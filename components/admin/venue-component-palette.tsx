"use client"

import {
  Armchair,
  CircleDot,
  GlassWater,
  LayoutGrid,
  LogIn,
  LogOut,
  Maximize2,
  Music2,
  Square,
  Users,
  Utensils,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { VenueElementType, VenueInfraSubtype } from "@/types/venue-map"

export type PalettePlacement =
  | { kind: "seat_block" }
  | { kind: "element"; type: VenueElementType; subtype?: VenueInfraSubtype }

const GROUPS: Array<{
  title: string
  items: Array<{
    placement: PalettePlacement
    label: string
    hint: string
    icon: typeof Armchair
  }>
}> = [
  {
    title: "Teatros y asientos",
    items: [
      {
        placement: { kind: "seat_block" },
        label: "Bloque de butacas",
        hint: "Filas, curvatura y pasillo",
        icon: LayoutGrid,
      },
      {
        placement: { kind: "element", type: "vip_chair" },
        label: "Silla VIP",
        hint: "Butaca individual",
        icon: Armchair,
      },
    ],
  },
  {
    title: "Mesas y mobiliario",
    items: [
      {
        placement: { kind: "element", type: "round_table" },
        label: "Mesa redonda",
        hint: "2 a 12 sillas",
        icon: CircleDot,
      },
      {
        placement: { kind: "element", type: "long_table" },
        label: "Tablón",
        hint: "Sillas lado A y B",
        icon: Square,
      },
      {
        placement: { kind: "element", type: "vip_box" },
        label: "Box / Living VIP",
        hint: "Grupo o por asiento",
        icon: Maximize2,
      },
    ],
  },
  {
    title: "Campo y zonas libres",
    items: [
      {
        placement: { kind: "element", type: "standing_zone" },
        label: "Campo de pie",
        hint: "Cupo máximo",
        icon: Users,
      },
    ],
  },
  {
    title: "Infraestructura",
    items: [
      {
        placement: { kind: "element", type: "infrastructure", subtype: "stage" },
        label: "Escenario",
        hint: "O DJ Booth",
        icon: Square,
      },
      {
        placement: { kind: "element", type: "infrastructure", subtype: "dj_booth" },
        label: "DJ Booth",
        hint: "Cabina",
        icon: Music2,
      },
      {
        placement: { kind: "element", type: "infrastructure", subtype: "bar" },
        label: "Barra",
        hint: "Bebidas",
        icon: GlassWater,
      },
      {
        placement: { kind: "element", type: "infrastructure", subtype: "restroom" },
        label: "Baños",
        hint: "Servicios",
        icon: Utensils,
      },
      {
        placement: { kind: "element", type: "infrastructure", subtype: "entrance" },
        label: "Entrada",
        hint: "Acceso",
        icon: LogIn,
      },
      {
        placement: { kind: "element", type: "infrastructure", subtype: "exit" },
        label: "Salida",
        hint: "Egreso",
        icon: LogOut,
      },
    ],
  },
]

export function VenueComponentPalette({
  active,
  onPick,
}: {
  active: PalettePlacement | null
  onPick: (placement: PalettePlacement) => void
}) {
  return (
    <aside className="max-h-[min(70vh,560px)] space-y-4 overflow-y-auto border-b border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-950 lg:border-r lg:border-b-0">
      <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-500 uppercase">
        Componentes
      </p>
      {GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-semibold text-zinc-500">{group.title}</p>
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {group.items.map((item) => {
              const Icon = item.icon
              const selected = placementKey(active) === placementKey(item.placement)
              return (
                <button
                  key={item.label}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      "application/x-tokepass-venue",
                      JSON.stringify(item.placement),
                    )
                    event.dataTransfer.effectAllowed = "copy"
                  }}
                  onClick={() => onPick(item.placement)}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition",
                    selected
                      ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                      : "border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20",
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  <span>
                    <span className="block text-xs font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {item.hint}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </aside>
  )
}

function placementKey(placement: PalettePlacement | null): string {
  if (!placement) return ""
  if (placement.kind === "seat_block") return "seat_block"
  return `${placement.type}:${placement.subtype ?? ""}`
}
