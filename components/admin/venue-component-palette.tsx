"use client"

import {
  Armchair,
  ChefHat,
  CircleDot,
  DoorOpen,
  GlassWater,
  Grid3x3,
  Layers,
  LayoutGrid,
  LogIn,
  Maximize2,
  Music2,
  ParkingCircle,
  PanelLeftClose,
  PanelLeftOpen,
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
  | { kind: "grid_array" }
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

const PALETTE_TABS: Array<{
  id: "shapes" | "seats" | "tables" | "services"
  title: string
  items: PaletteItem[]
}> = [
  {
    id: "shapes",
    title: "Formas y zonas",
    items: [
      {
        placement: { kind: "element", type: "infrastructure", subtype: "stage" },
        label: "Escenario",
        shortLabel: "Escena",
        hint: "Solo orientación. No se vende.",
        icon: Sparkles,
      },
      {
        placement: { kind: "element", type: "standing_zone" },
        label: "Campo / pista",
        shortLabel: "Pista",
        hint: "Zona con cupo. El comprador elige cantidad.",
        icon: Users,
      },
      {
        placement: { kind: "element", type: "vip_box" },
        label: "Box VIP",
        shortLabel: "VIP",
        hint: "Living o palco. Precio por box.",
        icon: Maximize2,
      },
      {
        placement: { kind: "zone_polygon" },
        label: "Trazar zona",
        shortLabel: "Zona",
        hint: "Dibujá un polígono. El inventario se genera por filas y mesas.",
        icon: PenTool,
      },
    ],
  },
  {
    id: "seats",
    title: "Asientos",
    items: [
      {
        placement: { kind: "seat_block" },
        label: "Bloque de butacas",
        shortLabel: "Filas",
        hint: "Filas numeradas para vender asientos.",
        icon: LayoutGrid,
      },
      {
        placement: { kind: "grid_array" },
        label: "Matriz filas × columnas",
        shortLabel: "Gradas",
        hint: "Genera un bloque de sillas o mesas con filas, columnas y separación.",
        icon: Grid3x3,
      },
      {
        placement: { kind: "rings" },
        label: "Graderías en arco",
        shortLabel: "Arcos",
        hint: "Arcos de mesas o butacas alrededor del escenario.",
        icon: Layers,
      },
      {
        placement: { kind: "element", type: "vip_chair" },
        label: "Butaca individual",
        shortLabel: "Butaca",
        hint: "Un asiento con precio propio.",
        icon: Armchair,
      },
    ],
  },
  {
    id: "tables",
    title: "Mesas",
    items: [
      {
        placement: { kind: "element", type: "round_table" },
        label: "Mesa redonda",
        shortLabel: "Redonda",
        hint: "Se vende como mesa. 2 a 12 sillas.",
        icon: CircleDot,
      },
      {
        placement: { kind: "element", type: "long_table" },
        label: "Mesa rectangular",
        shortLabel: "Recta",
        hint: "Se vende como tablón. Sillas en ambos lados.",
        icon: Square,
      },
    ],
  },
  {
    id: "services",
    title: "Servicios",
    items: [],
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

const PALETTE_SHORTCUTS: PaletteItem[] = [
  PALETTE_TABS[1]!.items[0]!,
  PALETTE_TABS[1]!.items[3]!,
  PALETTE_TABS[2]!.items[0]!,
  PALETTE_TABS[0]!.items[0]!,
]

export function VenueComponentPalette({
  active,
  onPick,
  variant = "compact",
  surface = "sidebar",
  className,
  collapsed = false,
  onCollapsedChange,
}: {
  active: PalettePlacement | null
  onPick: (placement: PalettePlacement) => void
  variant?: "compact" | "studio"
  surface?: "sidebar" | "sheet"
  className?: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
}) {
  const studio = variant === "studio"
  const sheet = surface === "sheet"
  const tabs = PALETTE_TABS.map((tab) =>
    tab.id === "services"
      ? {
          ...tab,
          items: INFRA_ITEMS.filter(
            (item) =>
              item.placement.kind !== "element" ||
              item.placement.subtype !== "stage",
          ),
        }
      : tab,
  )
  const canCollapse = Boolean(onCollapsedChange) && studio && !sheet

  if (canCollapse && collapsed) {
    return (
      <aside
        className={cn(
          "flex h-full w-12 shrink-0 flex-col items-center gap-1 overflow-hidden border-r border-border bg-card py-2 text-card-foreground",
          className,
        )}
      >
        <button
          type="button"
          title="Expandir paleta"
          aria-label="Expandir paleta"
          onClick={() => onCollapsedChange?.(false)}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
        <div className="mt-1 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1">
          {PALETTE_SHORTCUTS.map((item) => {
            const Icon = item.icon
            const selected = placementKey(active) === placementKey(item.placement)
            return (
              <button
                key={item.label}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => onPick(item.placement)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md",
                  selected
                    ? "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </button>
            )
          })}
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full shrink-0 flex-col bg-card text-card-foreground",
        sheet
          ? "h-auto overflow-hidden border-0"
          : studio
            ? "h-full w-72 overflow-hidden border-r border-border"
            : "max-h-[min(70vh,560px)] overflow-y-auto border-b border-border p-4 lg:border-r lg:border-b-0",
        className,
      )}
    >
      {sheet ? null : studio ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-2">
          <p className="px-1 text-xs font-semibold">Herramientas</p>
          {canCollapse ? (
            <button
              type="button"
              title="Contraer paleta"
              aria-label="Contraer paleta"
              onClick={() => onCollapsedChange?.(true)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mb-3 text-base font-semibold text-foreground">
          Qué querés agregar
        </p>
      )}
      <Tabs
        defaultValue="shapes"
        className={cn("min-h-0 w-full", studio ? "flex flex-1 flex-col gap-2 p-2" : "gap-3")}
      >
        <TabsList
          className={cn(
            "flex h-auto w-full flex-wrap rounded-xl bg-muted p-1",
            studio &&
              "h-10 shrink-0 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800",
          )}
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                "flex-1",
                sheet
                  ? "min-h-[44px] px-2 text-sm"
                  : studio
                    ? "h-8 px-1.5 text-[11px] font-semibold text-zinc-500 data-active:bg-background data-active:text-foreground data-active:shadow-sm dark:text-zinc-400 dark:data-active:text-zinc-50"
                    : "h-auto min-h-11 whitespace-normal px-2 py-2 text-sm leading-snug",
              )}
            >
              {studio
                ? tab.id === "shapes"
                  ? "Zonas"
                  : tab.id === "seats"
                    ? "Asientos"
                    : tab.id === "tables"
                      ? "Mesas"
                      : "Servicios"
                : tab.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent
            key={tab.id}
            value={tab.id}
            className={
              studio
                ? "min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5"
                : "space-y-3"
            }
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {tab.title}
            </p>
            {tab.id === "services" && !studio ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Estos dibujos ayudan a ubicarse. El comprador no puede tocarlos
                ni pagarlos.
              </p>
            ) : null}
            <div className={studio ? "grid grid-cols-2 gap-1.5" : "space-y-2"}>
              {tab.items.map((item) => (
                <PaletteButton
                  key={item.label}
                  item={item}
                  active={active}
                  onPick={onPick}
                  compact={studio}
                  touchFriendly={sheet}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </aside>
  )
}

function PaletteButton({
  item,
  active,
  onPick,
  compact,
  touchFriendly = false,
}: {
  item: PaletteItem
  active: PalettePlacement | null
  onPick: (placement: PalettePlacement) => void
  compact?: boolean
  touchFriendly?: boolean
}) {
  const Icon = item.icon
  const selected = placementKey(active) === placementKey(item.placement)
  return (
    <button
      type="button"
      title={item.hint}
      aria-label={`${item.label}. ${item.hint}`}
      draggable={
        item.placement.kind !== "rings" &&
        item.placement.kind !== "zone_polygon" &&
        item.placement.kind !== "grid_array"
      }
      onDragStart={(event) => {
        if (
          item.placement.kind === "rings" ||
          item.placement.kind === "zone_polygon" ||
          item.placement.kind === "grid_array"
        ) {
          return
        }
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
          ? "flex h-14 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-1.5"
          : "flex w-full items-start gap-3 rounded-xl px-3 py-3",
        touchFriendly && "min-h-[44px] aspect-auto py-3",
        selected
          ? "border-emerald-500/50 bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/30"
          : compact
            ? "border border-zinc-200 bg-white text-foreground hover:border-emerald-500/30 hover:bg-muted hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            : "border-border bg-muted/50 text-foreground hover:border-emerald-500/30 hover:bg-muted",
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
  if (placement.kind === "grid_array") return "grid_array"
  if (placement.kind === "rings") return "rings"
  if (placement.kind === "zone_polygon") return "zone_polygon"
  return `${placement.type}:${placement.subtype ?? ""}`
}
