"use client"

import { GraduationCap, Map, PartyPopper, Trophy } from "lucide-react"
import { useFormContext, useWatch } from "react-hook-form"

import { DraftCard, DraftHint } from "./event-editor-v2-ui"
import {
  ARCHETYPES,
  EVENT_DRAFT_ARCHETYPES,
  archetypeSupportsVirtual,
  getArchetypeConfig,
  resolveDraftArchetype,
  type EventDraftArchetype,
} from "@/lib/events/archetypes.config"
import { cn } from "@/lib/utils"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

const ARCHETYPE_ICONS = {
  PartyPopper,
  Map,
  GraduationCap,
  Trophy,
} as const

export function useDraftArchetype() {
  const { control } = useFormContext<EventDraftV2>()
  const raw = useWatch({ control, name: "archetype" })
  const archetype = resolveDraftArchetype(raw)
  const config = getArchetypeConfig(archetype)
  return {
    archetype,
    config,
    labels: config.labels,
    supportsVirtual: archetypeSupportsVirtual(archetype),
  }
}

export function EventEditorV2ArchetypePicker() {
  const { getValues, setValue } = useFormContext<EventDraftV2>()
  const { archetype } = useDraftArchetype()

  function selectArchetype(id: EventDraftArchetype) {
    setValue("archetype", id, { shouldDirty: true, shouldTouch: true })
    if (!archetypeSupportsVirtual(id) && getValues("isVirtual")) {
      setValue("isVirtual", false, { shouldDirty: true, shouldTouch: true })
      setValue("settings.deliveryMode", "PRESENCIAL", { shouldDirty: true })
    }
  }

  return (
    <DraftCard className="h-full">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          ¿Qué tipo de evento es?
        </h2>
        <DraftHint>
          Cambia los nombres de lugar, cupo y accesos según lo que estás armando.
        </DraftHint>
      </div>
      <div
        role="radiogroup"
        aria-label="Arquetipo del evento"
        className="grid flex-grow grid-cols-1 content-start gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {EVENT_DRAFT_ARCHETYPES.map((id) => {
          const item = ARCHETYPES[id]
          const Icon = ARCHETYPE_ICONS[item.icon]
          const selected = archetype === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => selectArchetype(id)}
              className={cn(
                "flex min-h-[5.5rem] flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition-all duration-200",
                selected
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                  : "border-slate-200 bg-white/60 text-slate-700 hover:border-emerald-500/40 hover:bg-white dark:border-gray-800 dark:bg-gray-950/40 dark:text-zinc-300",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="text-xs font-bold leading-snug">{item.title}</span>
            </button>
          )
        })}
      </div>
    </DraftCard>
  )
}
