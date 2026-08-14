"use client"

import {
  Armchair,
  ChefHat,
  CircleDot,
  DoorOpen,
  GlassWater,
  Layers,
  LayoutGrid,
  LogIn,
  Maximize2,
  Music2,
  ParkingCircle,
  Sparkles,
  Square,
  Toilet as Restroom,
  Users,
} from "lucide-react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { VenueElementType, VenueInfraSubtype } from "@/types/venue-map"

export type PalettePlacement =
  | { kind: "seat_block" }
  | { kind: "rings" }
  | { kind: "element"; type: VenueElementType; subtype?: VenueInfraSubtype }

const COMMERCIAL_GROUPS: Array<{
  id: string
  title: string
  items: Array<{
    placement: PalettePlacement
    label: string
    hint: string
    icon: typeof Armchair
  }>
}> = [
  {
    id: "furniture",
    title: "Mesas y sillas",
    items: [
      {
        placement: { kind: "element", type: "round_table" },
        label: "Mesa redonda",
        hint: "Se vende como mesa. 2 a 12 sillas.",
        icon: CircleDot,
      },
      {
        placement: { kind: "element", type: "long_table" },
        label: "Tablón rectangular",
        hint: "Se vende como tablón. Sillas en ambos lados.",
        icon: Square,
      },
      {
        placement: { kind: "element", type: "vip_box" },
        label: "Box VIP",
        hint: "Living o palco. Precio por box.",
        icon: Maximize2,
      },
      {
        placement: { kind: "element", type: "vip_chair" },
        label: "Silla / butaca",
        hint: "Un asiento con precio propio.",
        icon: Armchair,
      },
    ],
  },
  {
    id: "theater",
    title: "Filas y graderías",
    items: [
      {
        placement: { kind: "seat_block" },
        label: "Bloque de butacas",
        hint: "Filas numeradas para vender asientos.",
        icon: LayoutGrid,
      },
      {
        placement: { kind: "rings" },
        label: "Graderías en curva",
        hint: "Arcos de mesas o butacas alrededor del escenario.",
        icon: Layers,
      },
    ],
  },
  {
    id: "standing",
    title: "Campo",
    items: [
      {
        placement: { kind: "element", type: "standing_zone" },
        label: "Campo general de pie",
        hint: "Zona con cupo. El comprador elige cantidad.",
        icon: Users,
      },
    ],
  },
]

const INFRA_ITEMS: Array<{
  placement: PalettePlacement
  label: string
  hint: string
  icon: typeof Armchair
}> = [
  {
    placement: { kind: "element", type: "infrastructure", subtype: "stage" },
    label: "Escenario",
    hint: "Solo orientación. No se vende.",
    icon: Sparkles,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "dj_booth" },
    label: "Cabina DJ",
    hint: "Referencia visual. No se vende.",
    icon: Music2,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "bar" },
    label: "Barra",
    hint: "Referencia visual. No se vende.",
    icon: GlassWater,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "restroom" },
    label: "Baños",
    hint: "Referencia visual. No se vende.",
    icon: Restroom,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "entrance" },
    label: "Acceso / entrada",
    hint: "Referencia visual. No se vende.",
    icon: LogIn,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "exit" },
    label: "Salida de emergencia",
    hint: "Referencia visual. No se vende.",
    icon: DoorOpen,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "parking" },
    label: "Estacionamiento",
    hint: "Referencia visual. No se vende.",
    icon: ParkingCircle,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "kitchen" },
    label: "Cocina",
    hint: "Referencia visual. No se vende.",
    icon: ChefHat,
  },
]

export function VenueComponentPalette({
  active,
  onPick,
  variant = "compact",
}: {
  active: PalettePlacement | null
  onPick: (placement: PalettePlacement) => void
  variant?: "compact" | "studio"
}) {
  const commercial = COMMERCIAL_GROUPS.map((group) => (
    <div key={group.id} className="space-y-2">
      <p className="text-sm font-semibold text-foreground">{group.title}</p>
      {group.items.map((item) => (
        <PaletteButton
          key={item.label}
          item={item}
          active={active}
          onPick={onPick}
        />
      ))}
    </div>
  ))

  const references = (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Estos dibujos ayudan a ubicarse. El comprador no puede tocarlos ni
        pagarlos.
      </p>
      {INFRA_ITEMS.map((item) => (
        <PaletteButton
          key={item.label}
          item={item}
          active={active}
          onPick={onPick}
        />
      ))}
    </div>
  )

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-border bg-card/50 p-4",
        variant === "studio"
          ? "h-full w-80 overflow-y-auto border-r"
          : "max-h-[min(70vh,560px)] overflow-y-auto border-b lg:border-r lg:border-b-0",
      )}
    >
      <p className="mb-3 text-base font-semibold text-foreground">
        Qué querés agregar
      </p>
      <Tabs defaultValue="commercial" className="min-h-0 w-full gap-3">
        <TabsList className="flex h-auto w-full rounded-xl bg-muted p-1">
          <TabsTrigger
            value="commercial"
            className="h-auto min-h-11 flex-1 whitespace-normal px-2 py-2 text-sm leading-snug"
          >
            Lugares a la venta
          </TabsTrigger>
          <TabsTrigger
            value="map"
            className="h-auto min-h-11 flex-1 whitespace-normal px-2 py-2 text-sm leading-snug"
          >
            Mapa y referencias
          </TabsTrigger>
        </TabsList>
        <TabsContent value="commercial" className="space-y-5">
          {commercial}
        </TabsContent>
        <TabsContent value="map">{references}</TabsContent>
      </Tabs>
    </aside>
  )
}

function PaletteButton({
  item,
  active,
  onPick,
}: {
  item: {
    placement: PalettePlacement
    label: string
    hint: string
    icon: typeof Armchair
  }
  active: PalettePlacement | null
  onPick: (placement: PalettePlacement) => void
}) {
  const Icon = item.icon
  const selected = placementKey(active) === placementKey(item.placement)
  return (
    <button
      type="button"
      draggable={item.placement.kind !== "rings"}
      onDragStart={(event) => {
        if (item.placement.kind === "rings") return
        event.dataTransfer.setData(
          "application/x-tokepass-venue",
          JSON.stringify(item.placement),
        )
        event.dataTransfer.effectAllowed = "copy"
      }}
      onClick={() => onPick(item.placement)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
        selected
          ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : "border-border bg-background hover:border-emerald-500/30",
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0 text-emerald-500" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-foreground">
          {item.label}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
          {item.hint}
        </span>
      </span>
    </button>
  )
}

function placementKey(placement: PalettePlacement | null): string {
  if (!placement) return ""
  if (placement.kind === "seat_block") return "seat_block"
  if (placement.kind === "rings") return "rings"
  return `${placement.type}:${placement.subtype ?? ""}`
}
