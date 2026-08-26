"use client"

import { Eye, Rocket } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import {
  EventEditorV2StickyHeader,
  type EditorV2StepId,
} from "./event-editor-v2-chrome"
import { EventEditorV2InfoStep } from "./event-editor-v2-info"
import { EventEditorV2InventoryStep } from "./event-editor-v2-inventory"
import { EventEditorV2LaunchStep } from "./event-editor-v2-launch"
import { EventEditorV2SuccessDialog } from "./event-editor-v2-success"
import { publishEventV2 } from "@/app/actions/events-v2"
import { persistErrorUserMessage } from "@/lib/errors/persist-error"
import { Button } from "@/components/ui/button"
import { useEventDraftV2Persist } from "@/hooks/use-event-draft-v2-persist"
import { useOrphanMapTicketGarbageCollector } from "@/hooks/use-orphan-map-ticket-gc"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { getArchetypeConfig, resolveDraftArchetype } from "@/lib/events/archetypes.config"
import {
  DRAFT_LEAVE_GUARD_MESSAGE,
  draftSaveBadge,
  eventPreviewPath,
  shouldBlockDraftLeave,
} from "@/lib/events/editor-v2-ux"
import {
  draftLaunchPreviewLabel,
  draftLaunchSubmitLabel,
  isDraftLaunchReady,
} from "@/lib/events/launch-center-v2"
import { cn } from "@/lib/utils"
import {
  eventPublishDisabledReason,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

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
  const [busy, setBusy] = useState<"idle" | "preview" | "publish">("idle")
  const actionBusyRef = useRef(false)
  const allowLeaveRef = useRef(false)
  const [nowPublished, setNowPublished] = useState(isPublished)
  const [allowLeave, setAllowLeave] = useState(false)
  const [successOpen, setSuccessOpen] = useState(false)
  const [successUrl, setSuccessUrl] = useState("")
  const [successUpdated, setSuccessUpdated] = useState(false)

  const form = useForm<EventDraftV2>({
    defaultValues: initialDraft,
    mode: "onTouched",
    shouldUnregister: false,
  })
  const { control, getValues, formState, reset } = form
  const { isDirty } = formState
  const watched = useWatch({ control })
  const markDraftClean = useCallback(
    (saved?: EventDraftV2) => {
      reset(saved ?? getValues(), { keepValues: true })
    },
    [getValues, reset],
  )
  const { saveStatus, saveError, online, persistDraft, flushAndPause, resume } =
    useEventDraftV2Persist(eventId, getValues, watched, {
      onSaved: markDraftClean,
    })
  const title = watched?.basicInfo?.name
  const labels = getArchetypeConfig(resolveDraftArchetype(watched?.archetype)).labels
  const launchReady = isDraftLaunchReady(getValues())
  const badge = draftSaveBadge(online, saveStatus)
  const working = busy !== "idle"
  const leaveBlocked = shouldBlockDraftLeave(saveStatus, {
    isDirty,
    isSubmitting: working,
    allowLeave,
  })
  const actionsDisabled = !launchReady || working
  const launchBlockedReason = launchReady
    ? ""
    : eventPublishDisabledReason(getValues())
  const publishTitle = launchReady
    ? nowPublished
      ? "Actualizar el evento publicado"
      : "Subir el evento al catálogo"
    : launchBlockedReason || "Completá el checklist del paso 3 para continuar."
  const previewTitle = launchReady
    ? nowPublished
      ? "Abrir la ficha como la ve un comprador"
      : "Guardar el borrador y probar la compra sin publicarlo"
    : launchBlockedReason || "Completá el checklist del paso 3 para continuar."
  const publishLabel = draftLaunchSubmitLabel(nowPublished, busy === "publish")
  const previewLabel = draftLaunchPreviewLabel(nowPublished, busy === "preview")

  useUnsavedChanges(leaveBlocked, DRAFT_LEAVE_GUARD_MESSAGE, {
    interceptLinks: true,
    isSubmitting: working,
    allowLeaveRef,
  })

  async function handlePreviewDraft() {
    if (!launchReady || working || actionBusyRef.current) return
    actionBusyRef.current = true
    if (nowPublished) {
      actionBusyRef.current = false
      window.open(eventPreviewPath(eventId), "_blank", "noopener,noreferrer")
      return
    }
    setBusy("preview")
    let redirected = false
    try {
      const saved = await flushAndPause()
      if (!saved.success) {
        toast.error(saved.error)
        return
      }
      const result = await publishEventV2(eventId, { status: "draft" })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      markDraftClean()
      allowLeaveRef.current = true
      setAllowLeave(true)
      redirected = true
      window.location.assign(result.previewPath)
    } catch (error) {
      toast.error(persistErrorUserMessage(error))
    } finally {
      actionBusyRef.current = false
      if (!redirected) {
        resume()
        setBusy("idle")
      }
    }
  }

  async function handlePublish() {
    if (!launchReady || working || actionBusyRef.current) return
    actionBusyRef.current = true
    const wasPublished = nowPublished
    setBusy("publish")
    try {
      const saved = await flushAndPause()
      if (!saved.success) {
        toast.error(saved.error)
        return
      }
      const result = await publishEventV2(eventId, { status: "published" })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      markDraftClean()
      allowLeaveRef.current = true
      setAllowLeave(true)
      setNowPublished(true)
      setSuccessUpdated(wasPublished)
      setSuccessUrl(result.publicUrl)
      setSuccessOpen(true)
    } catch (error) {
      toast.error(persistErrorUserMessage(error))
    } finally {
      actionBusyRef.current = false
      resume()
      setBusy("idle")
    }
  }

  const previewAction = (
    <Button
      type="button"
      variant="outline"
      disabled={actionsDisabled}
      title={previewTitle}
      className="hidden h-12 min-h-12 shrink-0 md:inline-flex"
      onClick={() => void handlePreviewDraft()}
    >
      <Eye className="size-4" aria-hidden />
      {previewLabel}
    </Button>
  )

  const primaryAction = (
    <div className="fixed bottom-0 left-0 z-50 w-full border-t border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:relative md:w-auto md:border-0 md:bg-transparent md:p-0">
      <Button
        type="button"
        disabled={actionsDisabled}
        title={publishTitle}
        className={cn(
          "h-12 min-h-12 w-full transition-all duration-200 md:w-auto",
          launchReady
            ? "bg-emerald-500 text-black hover:bg-emerald-400"
            : "cursor-not-allowed opacity-50",
        )}
        onClick={() => void handlePublish()}
      >
        <Rocket className="size-4" aria-hidden />
        {publishLabel}
      </Button>
    </div>
  )

  return (
    <FormProvider {...form}>
      <OrphanMapTicketGarbageCollector />
      <div className="w-full flex-1 overflow-x-hidden bg-background pb-20 text-foreground md:pb-0">
        <EventEditorV2StickyHeader
          step={step}
          ticketsLabel={labels.tickets}
          badge={badge}
          previewAction={previewAction}
          primaryAction={primaryAction}
          onStep={setStep}
          onRetrySave={
            saveStatus === "error" ? () => void persistDraft() : undefined
          }
        />

        <div className="mx-auto max-w-5xl px-4 py-8 pb-20 sm:px-6 md:pb-8">
          <div className="mb-8 min-w-0">
            <p className="text-xs font-bold tracking-[0.18em] text-emerald-400 uppercase">
              Editor
            </p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              {title?.trim() || "Sin título"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Se guarda solo. Completá lo esencial y publicá cuando esté listo.
            </p>
          </div>

          <section className="min-w-0">
            <div key={step} className="animate-in fade-in duration-200">
              {step === 1 ? <EventEditorV2InfoStep eventId={eventId} /> : null}
              {step === 2 ? <EventEditorV2InventoryStep eventId={eventId} /> : null}
              {step === 3 ? (
                <EventEditorV2LaunchStep
                  isPublished={nowPublished}
                  publishing={busy === "publish"}
                  previewing={busy === "preview"}
                  launchReady={launchReady}
                  launchBlockedReason={launchBlockedReason}
                  onPreview={() => void handlePreviewDraft()}
                  onLaunch={() => void handlePublish()}
                />
              ) : null}
            </div>

            {saveStatus === "error" ? (
              <div className="mt-6 space-y-3">
                {saveError ? (
                  <pre className="overflow-auto whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-100">
                    {saveError}
                  </pre>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void persistDraft()}
                >
                  Reintentar guardado
                </Button>
              </div>
            ) : null}
          </section>
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

function OrphanMapTicketGarbageCollector() {
  useOrphanMapTicketGarbageCollector()
  return null
}
