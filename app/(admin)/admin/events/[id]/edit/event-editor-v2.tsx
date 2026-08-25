"use client"

import { ArrowLeft, Settings2, Ticket, Type } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { toast } from "sonner"

import { EventEditorV2InfoStep } from "./event-editor-v2-info"
import { EventEditorV2InventoryStep } from "./event-editor-v2-inventory"
import { EventEditorV2SettingsStep } from "./event-editor-v2-settings"
import { saveEventDraftV2 } from "@/app/actions/events-v2"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  eventPublishDisabledReason,
  isEventDraftPublishable,
  toEventDraftV2Payload,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

const STEPS = [
  {
    id: 1,
    label: "Información",
    hint: "Nombre, fechas e imágenes",
    icon: Type,
  },
  {
    id: 2,
    label: "Entradas",
    hint: "Aforo, tickets y extras",
    icon: Ticket,
  },
  {
    id: 3,
    label: "Configuración",
    hint: "Visibilidad y políticas",
    icon: Settings2,
  },
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
    defaultValues: initialDraft,
    mode: "onTouched",
    shouldUnregister: false,
  })
  const { watch, getValues } = form
  const values = watch()
  const title = values.basicInfo?.name
  const canPublish = isEventDraftPublishable(values)
  const publishReason = canPublish ? "" : eventPublishDisabledReason(values)

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
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-gray-400 transition-all duration-200 hover:bg-white/5 hover:text-foreground"
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
              <p className="mt-2 text-sm text-gray-500">
                Se guarda solo. Completá lo esencial y publicá cuando esté listo.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <p
                className={cn(
                  "text-sm font-medium",
                  saveStatus === "saving" && "text-amber-600 dark:text-amber-300",
                  saveStatus === "saved" && "text-emerald-600 dark:text-emerald-400",
                  saveStatus === "error" && "text-red-600 dark:text-red-400",
                  saveStatus === "idle" && "text-gray-400",
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
              <Button
                type="button"
                disabled={!canPublish}
                title={
                  canPublish
                    ? "Publicar el evento"
                    : publishReason || "Completá los datos obligatorios para publicar."
                }
                className={cn(
                  "transition-all duration-200",
                  canPublish
                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "cursor-not-allowed opacity-50",
                )}
                onClick={() =>
                  toast.message("El borrador ya cumple lo mínimo para publicar.", {
                    description:
                      "Publicar V2 todavía no materializa tickets ni recinto.",
                  })
                }
              >
                Publicar V2
              </Button>
            </div>
          </header>

          <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {STEPS.map((item) => {
                const active = step === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    className={cn(
                      "inline-flex min-w-[9.5rem] shrink-0 items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200 lg:min-w-0",
                      active
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                        : "border-transparent text-gray-400 hover:border-gray-700/60 hover:bg-white/5 hover:text-gray-300",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-all duration-200",
                        active
                          ? "border-emerald-500/50 bg-emerald-500/15"
                          : "border-gray-700 text-gray-400",
                      )}
                    >
                      {item.id}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        <item.icon className="size-3.5" aria-hidden />
                        {item.label}
                      </span>
                      <span className="mt-0.5 hidden text-xs text-gray-500 lg:block">
                        {item.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>

            <section className="min-w-0 rounded-2xl border border-border/50 bg-white/40 p-5 transition-all duration-200 dark:border-gray-800 dark:bg-gray-950/40">
              <div key={step} className="animate-in fade-in duration-200">
                {step === 1 ? <EventEditorV2InfoStep eventId={eventId} /> : null}
                {step === 2 ? <EventEditorV2InventoryStep /> : null}
                {step === 3 ? <EventEditorV2SettingsStep /> : null}
              </div>

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
