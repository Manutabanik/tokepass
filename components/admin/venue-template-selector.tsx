"use client"

import {
  Bookmark,
  Landmark,
  Music,
  Plus,
  Sparkles,
  Ticket,
  Trash2,
  Utensils,
} from "lucide-react"

import type { OrganizerVenueTemplate } from "@/app/actions/venue-templates"
import {
  VENUE_TEMPLATE_CATALOG,
  type BuiltinVenueTemplateId,
  type BuiltinVenueTemplateMeta,
} from "@/lib/constants/venue-templates"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { InteractiveVenueMap } from "@/types/venue-map"

const ICONS = {
  ticket: Ticket,
  landmark: Landmark,
  utensils: Utensils,
  sparkles: Sparkles,
  music: Music,
  plus: Plus,
} as const

export function VenueTemplateLibrary({
  customTemplates,
  onPickBuiltin,
  onPickCustom,
  onDeleteCustom,
  onSkip,
}: {
  customTemplates: OrganizerVenueTemplate[]
  onPickBuiltin: (id: BuiltinVenueTemplateId) => void
  onPickCustom: (map: InteractiveVenueMap) => void
  onDeleteCustom?: (id: string) => void
  onSkip?: () => void
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground">
              Plantillas de recinto
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Elegí un modelo listo para usar. El plano se carga al instante;
              después solo asignás el precio de cada sector.
            </p>
          </div>
          {onSkip ? (
            <Button type="button" variant="ghost" onClick={onSkip}>
              Seguir con el mapa actual
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {VENUE_TEMPLATE_CATALOG.map((item) => (
            <TemplateCard
              key={item.id}
              item={item}
              onClick={() => onPickBuiltin(item.id)}
            />
          ))}
        </div>

        {customTemplates.length > 0 ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Mis plantillas
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {customTemplates.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col rounded-2xl border border-border bg-card p-4 text-left shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => onPickCustom(item.venueMap)}
                    className="flex min-w-0 items-start gap-3 text-left"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
                      <Bookmark className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug text-foreground">
                        {item.name}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        Recinto guardado por tu organización
                      </span>
                    </span>
                  </button>
                  {onDeleteCustom ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-3 self-start text-destructive"
                      onClick={() => onDeleteCustom(item.id)}
                    >
                      <Trash2 className="size-4" />
                      Eliminar
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

export const VenueTemplateSelector = VenueTemplateLibrary

function TemplateCard({
  item,
  onClick,
}: {
  item: BuiltinVenueTemplateMeta
  onClick: () => void
}) {
  const Icon = ICONS[item.icon]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition",
        "hover:border-emerald-500/40 hover:bg-emerald-500/5",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-foreground">
          {item.title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {item.description}
        </span>
      </span>
    </button>
  )
}
