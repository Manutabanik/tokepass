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
  PenTool,
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
  | { kind: "zone_polygon" }
  | { kind: "element"; type: VenueElementType; subtype?: VenueInfraSubtype }

type PaletteItem = {
  placement: PalettePlacement
  label: string
  shortLabel: string
  hint: string
  icon: typeof Armchair
}

const COMMERCIAL_GROUPS: Array<{
  id: string
  title: string
  items: PaletteItem[]
}> = [
  {
    id: "furniture",
    title: "Mesas y sillas",
    items: [
      {
        placement: { kind: "element", type: "round_table" },
        label: "Mesa redonda",
        shortLabel: "Mesa",
        hint: "Se vende como mesa. 2 a 12 sillas.",
        icon: CircleDot,
      },
      {
        placement: { kind: "element", type: "long_table" },
        label: "Tablón rectangular",
        shortLabel: "Tablón",
        hint: "Se vende como tablón. Sillas en ambos lados.",
        icon: Square,
      },
      {
        placement: { kind: "element", type: "vip_box" },
        label: "Box VIP",
        shortLabel: "Box",
        hint: "Living o palco. Precio por box.",
        icon: Maximize2,
      },
      {
        placement: { kind: "element", type: "vip_chair" },
        label: "Silla / butaca",
        shortLabel: "Silla",
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
        shortLabel: "Butacas",
        hint: "Filas numeradas para vender asientos.",
        icon: LayoutGrid,
      },
      {
        placement: { kind: "rings" },
        label: "Graderías en curva",
        shortLabel: "Grada",
        hint: "Arcos de mesas o butacas alrededor del escenario.",
        icon: Layers,
      },
    ],
  },
  {
    id: "festival",
    title: "Festivales",
    items: [
      {
        placement: { kind: "zone_polygon" },
        label: "Trazar zona paramétrica",
        shortLabel: "Zona",
        hint: "Dibujá un polígono sobre la foto. El inventario se genera por filas y mesas, sin dibujar cada una.",
        icon: PenTool,
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
        shortLabel: "Campo",
        hint: "Zona con cupo. El comprador elige cantidad.",
        icon: Users,
      },
    ],
  },
]

const INFRA_ITEMS: PaletteItem[] = [
  {
    placement: { kind: "element", type: "infrastructure", subtype: "stage" },
    label: "Escenario",
    shortLabel: "Escena",
    hint: "Solo orientación. No se vende.",
    icon: Sparkles,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "dj_booth" },
    label: "Cabina DJ",
    shortLabel: "DJ",
    hint: "Referencia visual. No se vende.",
    icon: Music2,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "bar" },
    label: "Barra",
    shortLabel: "Barra",
    hint: "Referencia visual. No se vende.",
    icon: GlassWater,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "restroom" },
    label: "Baños",
    shortLabel: "Baños",
    hint: "Referencia visual. No se vende.",
    icon: Restroom,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "entrance" },
    label: "Acceso / entrada",
    shortLabel: "Acceso",
    hint: "Referencia visual. No se vende.",
    icon: LogIn,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "exit" },
    label: "Salida de emergencia",
    shortLabel: "Salida",
    hint: "Referencia visual. No se vende.",
    icon: DoorOpen,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "parking" },
    label: "Estacionamiento",
    shortLabel: "Parking",
    hint: "Referencia visual. No se vende.",
    icon: ParkingCircle,
  },
  {
    placement: { kind: "element", type: "infrastructure", subtype: "kitchen" },
    label: "Cocina",
    shortLabel: "Cocina",
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
  const studio = variant === "studio"

  const commercial = COMMERCIAL_GROUPS.map((group) => (
    <div key={group.id} className={studio ? "space-y-1.5" : "space-y-2"}>
      <p
        className={cn(
          "font-semibold text-muted-foreground",
          studio
            ? "text-[10px] uppercase tracking-[0.16em]"
            : "text-sm text-foreground",
        )}
      >
        {group.title}
      </p>
      <div className={studio ? "grid grid-cols-2 gap-1.5" : "space-y-2"}>
        {group.items.map((item) => (
          <PaletteButton
            key={item.label}
            item={item}
            active={active}
            onPick={onPick}
            compact={studio}
          />
        ))}
      </div>
    </div>
  ))

  const references = (
    <div className={studio ? "space-y-1.5" : "space-y-2"}>
      {studio ? null : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Estos dibujos ayudan a ubicarse. El comprador no puede tocarlos ni
          pagarlos.
        </p>
      )}
      <div className={studio ? "grid grid-cols-2 gap-1.5" : "space-y-2"}>
        {INFRA_ITEMS.map((item) => (
          <PaletteButton
            key={item.label}
            item={item}
            active={active}
            onPick={onPick}
            compact={studio}
          />
        ))}
      </div>
    </div>
  )

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-border bg-card",
        studio
          ? "h-full w-64 overflow-hidden border-r"
          : "max-h-[min(70vh,560px)] overflow-y-auto border-b bg-card/50 p-4 lg:border-r lg:border-b-0",
      )}
    >
      {studio ? (
        <p className="shrink-0 border-b border-border px-3 py-2.5 text-xs font-semibold text-foreground">
          Herramientas
        </p>
      ) : (
        <p className="mb-3 text-base font-semibold text-foreground">
          Qué querés agregar
        </p>
      )}
      <Tabs
        defaultValue="commercial"
        className={cn("min-h-0 w-full", studio ? "flex flex-1 flex-col gap-2 p-2" : "gap-3")}
      >
        <TabsList
          className={cn(
            "flex h-auto w-full rounded-xl bg-muted p-1",
            studio && "shrink-0",
          )}
        >
          <TabsTrigger
            value="commercial"
            className={cn(
              "flex-1",
              studio
                ? "h-8 px-1.5 text-[11px]"
                : "h-auto min-h-11 whitespace-normal px-2 py-2 text-sm leading-snug",
            )}
          >
            {studio ? "Venta" : "Lugares a la venta"}
          </TabsTrigger>
          <TabsTrigger
            value="map"
            className={cn(
              "flex-1",
              studio
                ? "h-8 px-1.5 text-[11px]"
                : "h-auto min-h-11 whitespace-normal px-2 py-2 text-sm leading-snug",
            )}
          >
            {studio ? "Mapa" : "Mapa y referencias"}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="commercial"
          className={cn(
            studio ? "min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5" : "space-y-5",
          )}
        >
          {commercial}
        </TabsContent>
        <TabsContent
          value="map"
          className={studio ? "min-h-0 flex-1 overflow-y-auto pr-0.5" : undefined}
        >
          {references}
        </TabsContent>
      </Tabs>
    </aside>
  )
}

function PaletteButton({
  item,
  active,
  onPick,
  compact,
}: {
  item: PaletteItem
  active: PalettePlacement | null
  onPick: (placement: PalettePlacement) => void
  compact?: boolean
}) {
  const Icon = item.icon
  const selected = placementKey(active) === placementKey(item.placement)
  return (
    <button
      type="button"
      title={item.hint}
      aria-label={`${item.label}. ${item.hint}`}
      draggable={item.placement.kind !== "rings" && item.placement.kind !== "zone_polygon"}
      onDragStart={(event) => {
        if (item.placement.kind === "rings" || item.placement.kind === "zone_polygon") return
        event.dataTransfer.setData(
          "application/x-tokepass-venue",
          JSON.stringify(item.placement),
        )
        event.dataTransfer.effectAllowed = "copy"
      }}
      onClick={() => onPick(item.placement)}
      className={cn(
        "border text-left transition",
        compact
          ? "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2"
          : "flex w-full items-start gap-3 rounded-xl px-3 py-3",
        selected
          ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : "border-border bg-background hover:border-emerald-500/30 hover:bg-muted/40",
      )}
    >
      <Icon
        className={cn(
          "shrink-0 text-emerald-500",
          compact ? "size-4" : "mt-0.5 size-5",
        )}
      />
      {compact ? (
        <span className="max-w-full truncate text-[10px] font-medium leading-tight text-foreground">
          {item.shortLabel}
        </span>
      ) : (
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug text-foreground">
            {item.label}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {item.hint}
          </span>
        </span>
      )}
    </button>
  )
}

function placementKey(placement: PalettePlacement | null): string {
  if (!placement) return ""
  if (placement.kind === "seat_block") return "seat_block"
  if (placement.kind === "rings") return "rings"
  if (placement.kind === "zone_polygon") return "zone_polygon"
  return `${placement.type}:${placement.subtype ?? ""}`
}
