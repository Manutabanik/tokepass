"use client"

import { ArrowLeft, Rocket, Ticket, Type, WifiOff } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EventEditorV2InfoStep } from "./event-editor-v2-info"
import { EventEditorV2InventoryStep } from "./event-editor-v2-inventory"
import { EventEditorV2LaunchStep } from "./event-editor-v2-launch"
import { EventEditorV2SuccessDialog } from "./event-editor-v2-success"
import { publishEventV2 } from "@/app/actions/events-v2"
import { Button } from "@/components/ui/button"
import { useEventDraftV2Persist } from "@/hooks/use-event-draft-v2-persist"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { getArchetypeConfig, resolveDraftArchetype } from "@/lib/events/archetypes.config"
import {
  DRAFT_LEAVE_GUARD_MESSAGE,
  draftSaveBadge,
  shouldBlockDraftLeave,
} from "@/lib/events/editor-v2-ux"
import {
  draftLaunchSubmitLabel,
  isDraftLaunchReady,
} from "@/lib/events/launch-center-v2"
import { cn } from "@/lib/utils"
import { type EventDraftV2 } from "@/lib/validations/event-draft-v2"

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
    label: "Lanzamiento",
    hint: "Revisión y publicación",
    icon: Rocket,
  },
] as const

type EventEditorV2Props = {
  eventId: string
  initialDraft: EventDraftV2
  isPublished: boolean
}

export function EventEditorV2({
  eventId,
  initialDraft,
  isPublished,
}: EventEditorV2Props) {
  const [step, setStep] = useState<(typeof STEPS)[number]["id"]>(1)
  const [publishing, setPublishing] = useState(false)
  const [nowPublished, setNowPublished] = useState(isPublished)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successUrl, setSuccessUrl] = useState("")
  const [successUpdated, setSuccessUpdated] = useState(false)

  const form = useForm<EventDraftV2>({
    defaultValues: initialDraft,
    mode: "onTouched",
    shouldUnregister: false,
  })
  const { control, getValues } = form
  const watched = useWatch({ control })
  const { saveStatus, saveError, online, flushAndPause, resume } =
    useEventDraftV2Persist(eventId, getValues, watched)
  const title = watched?.basicInfo?.name
  const labels = getArchetypeConfig(resolveDraftArchetype(watched?.archetype)).labels
  const launchReady = isDraftLaunchReady(getValues())
  const badge = draftSaveBadge(online, saveStatus)
  const leaveBlocked = shouldBlockDraftLeave(saveStatus, publishing)

  useUnsavedChanges(leaveBlocked, DRAFT_LEAVE_GUARD_MESSAGE, {
    interceptLinks: true,
  })

  async function handlePublish() {
    if (!launchReady || publishing) return
    const wasPublished = nowPublished
    setPublishing(true)
    try {
      const saved = await flushAndPause()
      if (!saved.success) {
        toast.error(saved.error)
        return
      }
      const result = await publishEventV2(eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setNowPublished(true)
      setSuccessUpdated(wasPublished)
      setSuccessUrl(result.publicUrl)
      setSuccessOpen(true)
    } finally {
      resume()
      setPublishing(false)
    }
  }

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
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium",
                  badge.tone === "saving" &&
                    "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  badge.tone === "saved" &&
                    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  badge.tone === "error" &&
                    "bg-red-500/10 text-red-700 dark:text-red-400",
                  badge.tone === "offline" &&
                    "bg-amber-500/15 text-amber-800 dark:text-amber-200",
                  badge.tone === "idle" && "text-gray-400",
                )}
                aria-live="polite"
              >
                {badge.tone === "offline" ? (
                  <WifiOff className="size-3.5" aria-hidden />
                ) : null}
                {badge.label}
              </p>
              <Button
                type="button"
                disabled={!launchReady || publishing}
                title={
                  launchReady
                    ? nowPublished
                      ? "Actualizar el evento publicado"
                      : "Publicar el evento"
                    : "Completá el checklist del paso 3 para continuar."
                }
                className={cn(
                  "transition-all duration-200",
                  launchReady
                    ? nowPublished
                      ? "bg-sky-600 text-white hover:bg-sky-500"
                      : "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "cursor-not-allowed opacity-50",
                )}
                onClick={() => void handlePublish()}
              >
                {draftLaunchSubmitLabel(nowPublished, publishing)}
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
                        {item.id === 2 ? labels.tickets : item.label}
                      </span>
                      <span className="mt-0.5 hidden text-xs text-gray-500 lg:block">
                        {item.id === 2
                          ? `${labels.capacity} y ${labels.tickets.toLowerCase()}`
                          : item.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>

            <section className="min-w-0 rounded-2xl border border-border/50 bg-white/40 p-5 transition-all duration-200 dark:border-gray-800 dark:bg-gray-950/40">
              <div key={step} className="animate-in fade-in duration-200">
                {step === 1 ? <EventEditorV2InfoStep eventId={eventId} /> : null}
                {step === 2 ? <EventEditorV2InventoryStep eventId={eventId} /> : null}
                {step === 3 ? (
                  <EventEditorV2LaunchStep
                    isPublished={nowPublished}
                    publishing={publishing}
                    launchReady={launchReady}
                    onLaunch={() => void handlePublish()}
                  />
                ) : null}
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
      <EventEditorV2SuccessDialog
        open={successOpen}
        eventId={eventId}
        publicUrl={successUrl}
        updated={successUpdated}
        onOpenChange={setSuccessOpen}
      />
    </FormProvider>
  )
}
