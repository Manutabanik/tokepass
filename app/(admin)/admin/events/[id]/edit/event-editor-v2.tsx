"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Settings2, Ticket, Type } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { FormProvider, useForm, type Resolver } from "react-hook-form"

import { EventEditorV2InfoStep } from "./event-editor-v2-info"
import { EventEditorV2InventoryStep } from "./event-editor-v2-inventory"
import { EventEditorV2SettingsStep } from "./event-editor-v2-settings"
import { saveEventDraftV2 } from "@/app/actions/events-v2"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  eventDraftV2UiSchema,
  toEventDraftV2Payload,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

const STEPS = [
  { id: 1, label: "1. Información", icon: Type },
  { id: 2, label: "2. Entradas y Aforo", icon: Ticket },
  { id: 3, label: "3. Configuración", icon: Settings2 },
] as const

type EventEditorV2Props = {
  eventId: string
  initialDraft: EventDraftV2
}

export function EventEditorV2({ eventId, initialDraft }: EventEditorV2Props) {
  const [step, setStep] = useState<(typeof STEPS)[number]["id"]>(1)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  )
  const [saveError, setSaveError] = useState("")
  const autosaveReady = useRef(false)
  const saveGeneration = useRef(0)

  const form = useForm<EventDraftV2>({
    resolver: zodResolver(eventDraftV2UiSchema) as Resolver<EventDraftV2>,
    defaultValues: initialDraft,
    mode: "onTouched",
    shouldUnregister: false,
  })
  const { watch, getValues } = form
  const title = watch("basicInfo.name")

  useEffect(() => {
    let timer: number | undefined
    const { unsubscribe } = watch(() => {
      if (!autosaveReady.current) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const generation = ++saveGeneration.current
        setSaveStatus("saving")
        setSaveError("")
        void saveEventDraftV2(
          eventId,
          toEventDraftV2Payload(getValues()),
        ).then((result) => {
          if (generation !== saveGeneration.current) return
          if (!result.success) {
            setSaveStatus("error")
            setSaveError(result.error)
            return
          }
          setSaveStatus("saved")
        })
      }, 1500)
    })
    autosaveReady.current = true
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [eventId, getValues, watch])

  return (
    <FormProvider {...form}>
      <div className="w-full flex-1 overflow-x-hidden bg-background text-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center gap-3">
            <Link
              href="/admin/events"
              aria-label="Volver al Panel"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
            </Link>
          </div>

          <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.18em] text-emerald-400 uppercase">
                Editor V2
              </p>
              <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-foreground">
                {title?.trim() || "Sin título"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Autoguardado en <code>draft_state</code>. No toca tickets ni recinto.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <p
                className={cn(
                  "text-sm font-medium",
                  saveStatus === "saving" && "text-amber-600 dark:text-amber-300",
                  saveStatus === "saved" && "text-emerald-600 dark:text-emerald-400",
                  saveStatus === "error" && "text-red-600 dark:text-red-400",
                  saveStatus === "idle" && "text-muted-foreground",
                )}
                aria-live="polite"
              >
                {saveStatus === "saving"
                  ? "Guardando..."
                  : saveStatus === "saved"
                    ? "Guardado"
                    : saveStatus === "error"
                      ? "Error al guardar"
                      : "Sin cambios"}
              </p>
              <Button type="button" disabled>
                Publicar V2
              </Button>
            </div>
          </header>

          <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
            <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {STEPS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStep(item.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                    step === item.id
                      ? "border-emerald-500/40 bg-emerald-500/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-white/5 hover:text-foreground",
                  )}
                >
                  <item.icon className="mb-0.5 size-3.5 lg:mb-0" aria-hidden />
                  {item.label}
                </button>
              ))}
            </nav>

            <section className="min-w-0 rounded-2xl border border-border/50 bg-white/40 p-5 dark:bg-zinc-950/40">
              {step === 1 ? <EventEditorV2InfoStep /> : null}
              {step === 2 ? <EventEditorV2InventoryStep /> : null}
              {step === 3 ? <EventEditorV2SettingsStep /> : null}

              {saveStatus === "error" && saveError ? (
                <pre className="mt-6 overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-100">
                  {saveError}
                </pre>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </FormProvider>
  )
}
