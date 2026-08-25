"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect, useRef, useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { useRouter } from "next/navigation"

import { createEventDraftV2 } from "@/app/actions/event-draft-v2"
import { saveEventDraftV2 } from "@/app/actions/events-v2"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  emptyEventDraftV2,
  eventDraftV2UiSchema,
  toEventDraftV2Payload,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

type EventCreatorV2FormProps = {
  eventId?: string | null
  initialDraft?: EventDraftV2
}

export function EventCreatorV2Form({
  eventId: initialEventId,
  initialDraft,
}: EventCreatorV2FormProps) {
  const router = useRouter()
  const [eventId, setEventId] = useState(initialEventId?.trim() || "")
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  )
  const [message, setMessage] = useState("")
  const [lastSaved, setLastSaved] = useState<unknown>(initialDraft ?? null)
  const skipAutosave = useRef(true)

  const form = useForm<EventDraftV2>({
    resolver: zodResolver(eventDraftV2UiSchema) as Resolver<EventDraftV2>,
    defaultValues: initialDraft ?? emptyEventDraftV2(),
    mode: "onTouched",
  })

  const title = form.watch("basicInfo.name")

  async function persistDraft(id: string, values: EventDraftV2) {
    const result = await saveEventDraftV2(id, toEventDraftV2Payload(values))
    if (!result.success) {
      setStatus("error")
      setMessage(result.error)
      return false
    }
    setStatus("saved")
    setMessage("draft_state guardado")
    setLastSaved(result.draftState)
    return true
  }

  async function onSubmit(values: EventDraftV2) {
    setStatus("saving")
    setMessage("")
    let id = eventId
    if (!id) {
      const created = await createEventDraftV2()
      if (!created.success) {
        setStatus("error")
        setMessage(created.error)
        return
      }
      id = created.eventId
      setEventId(id)
    }
    const ok = await persistDraft(id, values)
    if (ok) {
      router.replace(`/admin/events/v2/${id}/edit`)
    }
  }

  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }
    if (!eventId) return
    const timer = window.setTimeout(() => {
      setStatus("saving")
      void saveEventDraftV2(
        eventId,
        toEventDraftV2Payload(form.getValues()),
      ).then((result) => {
        if (!result.success) {
          setStatus("error")
          setMessage(result.error)
          return
        }
        setStatus("saved")
        setMessage("draft_state guardado")
        setLastSaved(result.draftState)
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [eventId, title])

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto w-full max-w-xl space-y-6"
    >
      <div className="grid gap-2">
        <Label htmlFor="event-v2-title" className="text-sm font-bold text-slate-800 dark:text-zinc-200">
          Nombre del Evento
        </Label>
        <Input
          id="event-v2-title"
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-white"
          placeholder="Ej. After en la terraza"
          {...form.register("basicInfo.name")}
        />
        {form.formState.errors.basicInfo?.name ? (
          <p className="text-xs text-red-500">
            {form.formState.errors.basicInfo.name.message}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Guardando…" : "Guardar borrador"}
        </Button>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          {status === "saved"
            ? message
            : status === "error"
              ? ""
              : eventId
                ? "Autoguarda en events.draft_state"
                : "El primer guardado crea el evento y escribe el JSON"}
        </p>
      </div>

      {status === "error" ? (
        <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-100">
          {message}
        </pre>
      ) : null}

      {lastSaved != null ? (
        <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          {JSON.stringify(lastSaved, null, 2)}
        </pre>
      ) : null}
    </form>
  )
}
