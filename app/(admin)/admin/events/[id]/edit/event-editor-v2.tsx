"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import {
  EventEditorV2ActionDock,
  EventEditorV2SaveBadge,
  EventEditorV2StepNav,
  type EditorV2StepId,
} from "./event-editor-v2-chrome"
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
  const [step, setStep] = useState<EditorV2StepId>(1)
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
  const publishDisabled = !launchReady || publishing
  const publishTitle = launchReady
    ? nowPublished
      ? "Actualizar el evento publicado"
      : "Publicar el evento"
    : "Completá el checklist del paso 3 para continuar."
  const publishLabel = draftLaunchSubmitLabel(nowPublished, publishing)

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
        <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pt-6 pb-28 sm:px-6 md:pb-6 lg:px-8">
          <div className="mb-4 flex items-center gap-3 md:mb-6">
            <Link
              href="/admin/events"
              aria-label="Volver al Panel"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition-all duration-200 hover:bg-white/5 hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
            </Link>
          </div>

          <header className="mb-6 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.18em] text-emerald-400 uppercase">
                Editor V2
              </p>
              <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                {title?.trim() || "Sin título"}
              </h1>
              <p className="mt-2 hidden text-sm text-gray-500 sm:block">
                Se guarda solo. Completá lo esencial y publicá cuando esté listo.
              </p>
            </div>
            <div className="hidden shrink-0 flex-wrap items-center gap-3 md:flex">
              <EventEditorV2SaveBadge label={badge.label} tone={badge.tone} />
              <Button
                type="button"
                disabled={publishDisabled}
                title={publishTitle}
                className={cn(
                  "h-12 min-h-12 px-4 transition-all duration-200",
                  launchReady
                    ? nowPublished
                      ? "bg-sky-600 text-white hover:bg-sky-500"
                      : "bg-emerald-500 text-black hover:bg-emerald-400"
                    : "cursor-not-allowed opacity-50",
                )}
                onClick={() => void handlePublish()}
              >
                {publishLabel}
              </Button>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
            <EventEditorV2StepNav
              step={step}
              ticketsLabel={labels.tickets}
              capacityLabel={labels.capacity}
              onStep={setStep}
            />

            <section className="min-w-0 rounded-2xl border border-border/50 bg-white/40 p-4 transition-all duration-200 sm:p-5 dark:border-gray-800 dark:bg-gray-950/40">
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
      <EventEditorV2ActionDock
        badge={badge}
        publishDisabled={publishDisabled}
        publishTitle={publishTitle}
        publishLabel={publishLabel}
        published={nowPublished}
        onPublish={() => void handlePublish()}
      />
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
