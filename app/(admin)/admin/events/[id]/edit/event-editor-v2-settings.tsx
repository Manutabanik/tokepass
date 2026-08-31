"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"
import { toast } from "sonner"

import { updateEventCatalogVisibility } from "@/app/actions/events-v2"
import { cn } from "@/lib/utils"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

const VISIBILITY_OPTIONS = [
  {
    value: true,
    title: "Público",
    description: "Aparece en la página principal y buscador de Tokepass.",
    Icon: Eye,
  },
  {
    value: false,
    title: "Privado (Oculto)",
    description:
      "Solo se puede acceder con el enlace directo. Ideal para eventos exclusivos.",
    Icon: EyeOff,
  },
] as const

export function EventEditorV2SettingsStep({
  eventId,
  isPublished = false,
  onPersistHold,
}: {
  eventId: string
  isPublished?: boolean
  onPersistHold?: (hold: boolean) => void
}) {
  const { control } = useFormContext<EventDraftV2>()
  const [saving, setSaving] = useState(false)

  return (
    <Controller
      name="settings.isPublic"
      control={control}
      shouldUnregister={false}
      render={({ field }) => {
        const isPublic = field.value !== false
        return (
          <div
            role="radiogroup"
            aria-label="Visibilidad del evento"
            className="grid gap-3"
          >
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = isPublic === option.value
              return (
                <button
                  key={option.title}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-field={
                    option.value ? "settings.isPublic" : "settings.isPrivate"
                  }
                  disabled={saving}
                  onClick={() => {
                    if (selected) return
                    const previous = isPublic
                    field.onChange(option.value)
                    if (!isPublished) return
                    setSaving(true)
                    onPersistHold?.(true)
                    void updateEventCatalogVisibility(eventId, option.value)
                      .then((result) => {
                        if (result.success) return
                        field.onChange(previous)
                        toast.error(result.error)
                      })
                      .catch(() => {
                        field.onChange(previous)
                        toast.error("No se pudo actualizar la visibilidad.")
                      })
                      .finally(() => {
                        setSaving(false)
                        onPersistHold?.(false)
                      })
                  }}
                  className={cn(
                    "flex min-h-[4.5rem] items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200",
                    selected
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-border/60 bg-card hover:border-emerald-500/40",
                    saving && "opacity-70",
                  )}
                >
                  <option.Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      selected ? "text-emerald-400" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {option.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )
      }}
    />
  )
}
