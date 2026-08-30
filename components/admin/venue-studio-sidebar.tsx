"use client"

import {
  Armchair,
  CircleDot,
  DoorOpen,
  GlassWater,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Sparkles,
  Square,
  Toilet,
  Users,
} from "lucide-react"

import {
  VenueLayerTree,
  type LayerTreeSelection,
} from "@/components/admin/venue-layer-tree"
import type { PalettePlacement } from "@/components/admin/venue-component-palette"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap } from "@/types/venue-map"

type CatalogItem = {
  label: string
  placement: PalettePlacement
  icon: typeof Armchair
}

const COMMERCIAL: CatalogItem[] = [
  {
    label: "Mesa redonda",
    placement: { kind: "element", type: "round_table" },
    icon: CircleDot,
  },
  {
    label: "Tablón",
    placement: { kind: "element", type: "long_table" },
    icon: Square,
  },
  {
    label: "Butaca",
    placement: { kind: "element", type: "vip_chair" },
    icon: Armchair,
  },
  {
    label: "Grada en arco",
    placement: { kind: "rings" },
    icon: Layers,
  },
  {
    label: "Sector (lápiz)",
    placement: { kind: "zone_polygon" },
    icon: PenTool,
  },
]

const INFRASTRUCTURE: CatalogItem[] = [
  {
    label: "Escenario",
    placement: { kind: "element", type: "infrastructure", subtype: "stage" },
    icon: Sparkles,
  },
  {
    label: "Barra",
    placement: { kind: "element", type: "infrastructure", subtype: "bar" },
    icon: GlassWater,
  },
  {
    label: "Baños",
    placement: { kind: "element", type: "infrastructure", subtype: "restroom" },
    icon: Toilet,
  },
  {
    label: "Puerta",
    placement: { kind: "element", type: "infrastructure", subtype: "entrance" },
    icon: DoorOpen,
  },
  {
    label: "Pista",
    placement: { kind: "element", type: "standing_zone" },
    icon: Users,
  },
]

function placementKey(placement: PalettePlacement) {
  if (placement.kind === "element") {
    return `${placement.type}:${placement.subtype ?? ""}`
  }
  return placement.kind
}

export function VenueStudioSidebar({
  map,
  selection,
  onSelect,
  onSpawn,
  activePlacement = null,
  collapsed = false,
  onCollapsedChange,
  activeZoneId = null,
  className,
}: {
  map: InteractiveVenueMap
  selection: LayerTreeSelection | { kind: "elements"; ids: string[] } | null
  onSelect: (next: LayerTreeSelection) => void
  onSpawn: (placement: PalettePlacement) => void
  activePlacement?: PalettePlacement | null
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  activeZoneId?: string | null
  className?: string
}) {
  if (collapsed) {
    return (
      <aside
        className={cn(
          "flex h-full w-12 shrink-0 flex-col items-center border-r border-border bg-card py-2 text-card-foreground",
          className,
        )}
      >
        <button
          type="button"
          title="Expandir panel"
          aria-label="Expandir panel"
          onClick={() => onCollapsedChange?.(false)}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        "flex h-full w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-end border-b border-border px-2 py-1.5">
        {onCollapsedChange ? (
          <button
            type="button"
            title="Contraer panel"
            aria-label="Contraer panel"
            onClick={() => onCollapsedChange(true)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PanelLeftClose className="size-4" />
          </button>
        ) : null}
      </div>
      <Tabs
        defaultValue="construir"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b border-border px-2 py-2">
          <TabsList className="grid h-9 w-full grid-cols-2 bg-muted p-1">
            <TabsTrigger
              value="construir"
              className="h-7 text-xs font-semibold"
            >
              Construir
            </TabsTrigger>
            <TabsTrigger value="capas" className="h-7 text-xs font-semibold">
              Capas
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="construir"
          keepMounted
          className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        >
          <CatalogGroup
            title="Comercial"
            items={COMMERCIAL}
            active={activePlacement}
            onSpawn={onSpawn}
          />
          <CatalogGroup
            title="Infraestructura"
            items={INFRASTRUCTURE}
            active={activePlacement}
            onSpawn={onSpawn}
            className="mt-4"
          />
        </TabsContent>
        <TabsContent
          value="capas"
          keepMounted
          className="min-h-0 flex-1 overflow-hidden"
        >
          <VenueLayerTree
            map={map}
            selection={selection}
            onSelect={onSelect}
            activeZoneId={activeZoneId}
            embedded
            className="h-full border-0"
          />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

function CatalogGroup({
  title,
  items,
  active,
  onSpawn,
  className,
}: {
  title: string
  items: CatalogItem[]
  active: PalettePlacement | null
  onSpawn: (placement: PalettePlacement) => void
  className?: string
}) {
  return (
    <div className={className}>
      <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => {
          const Icon = item.icon
          const selected =
            active != null &&
            placementKey(active) === placementKey(item.placement)
          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={() => onSpawn(item.placement)}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition",
                selected
                  ? "border-emerald-500/50 bg-emerald-500/10 text-foreground ring-1 ring-emerald-500/30"
                  : "border-border bg-background text-foreground hover:border-emerald-500/40 hover:bg-muted",
              )}
            >
              <Icon className="size-5 text-emerald-500" aria-hidden="true" />
              <span className="text-[11px] leading-tight font-semibold">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
