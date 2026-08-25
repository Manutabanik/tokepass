"use client"

import { Controller, useFormContext } from "react-hook-form"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2SettingsStep() {
  const { control, register, watch } = useFormContext<EventDraftV2>()
  const isPublic = watch("settings.isPublic")

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="min-w-0">
          <Label
            htmlFor="event-v2-is-public"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Visibilidad del evento
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {isPublic
              ? "Público: visible en el catálogo cuando se publique."
              : "Privado: no aparece en el catálogo."}
          </p>
        </div>
        <Controller
          name="settings.isPublic"
          control={control}
          render={({ field }) => (
            <Switch
              id="event-v2-is-public"
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              className="data-checked:bg-emerald-500"
              aria-label="Visibilidad del evento"
            />
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label
          htmlFor="event-v2-refund-policy"
          className="text-sm font-bold text-slate-800 dark:text-zinc-200"
        >
          Política de devoluciones
        </Label>
        <Textarea
          id="event-v2-refund-policy"
          rows={5}
          placeholder="Ej. No se aceptan devoluciones. Cambio de titular hasta 24 h antes."
          {...register("settings.refundPolicy")}
        />
      </div>
    </div>
  )
}
