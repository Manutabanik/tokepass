"use client"

import { useFormContext } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2InfoStep() {
  const { register } = useFormContext<EventDraftV2>()

  return (
    <div className="grid max-w-xl gap-2">
      <Label
        htmlFor="event-v2-title"
        className="text-sm font-bold text-slate-800 dark:text-zinc-200"
      >
        Nombre del Evento
      </Label>
      <Input
        id="event-v2-title"
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-white"
        placeholder="Ej. After en la terraza"
        {...register("title")}
      />
    </div>
  )
}
