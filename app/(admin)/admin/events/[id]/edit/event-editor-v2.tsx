"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { EventEditorFeeProvider } from "./event-editor-fee-context"
import {
  EventEditorV2StickyHeader,
  type EditorV2StepId,
} from "./event-editor-v2-chrome"
import { EventEditorV2StickyFooter } from "./event-editor-v2-footer"
import { EventEditorV2InfoStep } from "./event-editor-v2-info"
import { EventEditorV2InventoryStep } from "./event-editor-v2-inventory"
import { EventEditorV2LaunchStep } from "./event-editor-v2-launch"
import { EventEditorV2SuccessDialog } from "./event-editor-v2-success"
import { getEventDraftV2, publishEventV2 } from "@/app/actions/events-v2"
import { focusInvalidFormField } from "@/lib/errors/form-field"
import { persistErrorUserMessage } from "@/lib/errors/persist-error"
import { Button } from "@/components/ui/button"
import { useEventDraftV2Persist } from "@/hooks/use-event-draft-v2-persist"
import { useOrphanMapTicketGarbageCollector } from "@/hooks/use-orphan-map-ticket-gc"
import { useSyncDraftDayRates } from "@/hooks/use-sync-draft-day-rates"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { getArchetypeConfig, resolveDraftArchetype } from "@/lib/events/archetypes.config"
import {
  applyDraftIssuesToForm,
  collectDraftPublishIssues,
  editorStepsWithFieldErrors,
  editorStepsWithIssues,
  editorTabAlert,
  firstDraftPublishIssue,
  nextEditorStep,
  prevEditorStep,
  type EditorTabAlert,
} from "@/lib/events/editor-v2-steps"
import {
  DRAFT_LEAVE_GUARD_MESSAGE,
  draftInventoryDrifted,
  draftSaveBadge,
  eventPreviewPath,
  shouldBlockDraftLeave,
} from "@/lib/events/editor-v2-ux"
import {
  draftLaunchSubmitLabel,
  isDraftLaunchReady,
} from "@/lib/events/launch-center-v2"
import { hydrateEventDraftV2ForEditor } from "@/lib/events/draft-day-priced-tickets"
import {
  defaultEventFeeConfig,
  type EventFeeConfig,
} from "@/lib/pricing/event-fees"
import {
  eventPublishDisabledReason,
  type EventDraftV2,
} from "@/lib/validations/event-draft-v2"

type EventEditorV2Props = {
  eventId: string
  initialDraft: EventDraftV2
  isPublished: boolean
  fee?: EventFeeConfig
}

export function EventEditorV2({
  eventId,
  initialDraft,
  isPublished,
  fee: initialFee,
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
  const [revealField, setRevealField] = useState<string | null>(null)
  const [fee, setFee] = useState<EventFeeConfig>(
    () => initialFee ?? defaultEventFeeConfig(),
  )

  const form = useForm<EventDraftV2>({
    defaultValues: initialDraft,
    mode: "onTouched",
    shouldUnregister: false,
  })
  const { control, getValues, setValue, formState, reset } = form
  const { isDirty } = formState
  const watched = useWatch({ control })
  const markDraftClean = useCallback(
    (saved?: EventDraftV2) => {
      if (saved && draftInventoryDrifted(getValues(), saved)) {
        const current = getValues()
        current.tickets.forEach((ticket, index) => {
          const next = saved.tickets[index]
          if (!next) return
          if (next.id && next.id !== ticket.id) {
            setValue(`tickets.${index}.id`, next.id, { shouldDirty: false })
          }
          ;(next.dayRates ?? []).forEach((rate, rateIndex) => {
            if (!rate.ticketId) return
            if (rate.ticketId === ticket.dayRates?.[rateIndex]?.ticketId) return
            setValue(
              `tickets.${index}.dayRates.${rateIndex}.ticketId`,
              rate.ticketId,
              { shouldDirty: false },
            )
          })
        })
        current.extras.forEach((extra, index) => {
          const next = saved.extras[index]
          if (next?.id && next.id !== extra.id) {
            setValue(`extras.${index}.id`, next.id, { shouldDirty: false })
          }
        })
      }
      reset(getValues(), { keepValues: true })
    },
    [getValues, reset, setValue],
  )
  const permitLeave = useCallback(() => {
    allowLeaveRef.current = true
    setAllowLeave(true)
  }, [])
  const revokeLeave = useCallback(() => {
    allowLeaveRef.current = false
    setAllowLeave(false)
  }, [])
  const persistHoldRef = useRef(false)
  const { saveStatus, saveError, online, persistDraft, flushAndPause, resume } =
    useEventDraftV2Persist(eventId, getValues, watched, {
      onSaved: markDraftClean,
      holdRef: persistHoldRef,
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
  const launchBlockedReason = launchReady
    ? ""
    : eventPublishDisabledReason(getValues())
  const publishLabel = draftLaunchSubmitLabel(nowPublished, busy === "publish")
  const fieldErrorSteps = editorStepsWithFieldErrors(formState.errors)
  const schemaIssueSteps = editorStepsWithIssues(
    collectDraftPublishIssues(getValues()),
  )
  const tabAlerts = useMemo(() => {
    const alerts: Partial<Record<EditorV2StepId, EditorTabAlert>> = {}
    for (const id of [1, 2, 3] as const) {
      alerts[id] = editorTabAlert(id, { fieldErrorSteps, schemaIssueSteps })
    }
    return alerts
  }, [fieldErrorSteps, schemaIssueSteps])

  function goToStep(next: EditorV2StepId) {
    setRevealField(null)
    setStep(next)
  }

  function goToIssue(stepId: EditorV2StepId, field?: string | null) {
    setRevealField(field ?? null)
    setStep(stepId)
    window.setTimeout(() => {
      focusInvalidFormField(field)
    }, 400)
  }

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
      const latest = await getEventDraftV2(eventId)
      if (latest.success) {
        setFee(latest.fee)
        const next = hydrateEventDraftV2ForEditor(latest.draftState)
        next.settings.absorbFees = latest.absorbFees
        reset(next)
      } else {
        markDraftClean()
      }
      permitLeave()
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
    if (working || actionBusyRef.current) return
    const issues = collectDraftPublishIssues(getValues())
    if (issues.length > 0) {
      applyDraftIssuesToForm(form.setError, issues)
      const first = firstDraftPublishIssue(issues)
      goToIssue(first?.step ?? 1, first?.name)
      toast.error(
        first?.message ||
          launchBlockedReason ||
          "Revisá los campos marcados antes de publicar.",
      )
      return
    }
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
      permitLeave()
      setNowPublished(true)
      const latest = await getEventDraftV2(eventId)
      if (latest.success) {
        setFee(latest.fee)
        const next = hydrateEventDraftV2ForEditor(latest.draftState)
        next.settings.absorbFees = latest.absorbFees
        reset(next)
      }
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

  return (
    <EventEditorFeeProvider fee={fee}>
      <FormProvider {...form}>
      <OrphanMapTicketGarbageCollector />
      <DraftDayRatesSync />
      <div className="w-full flex-1 overflow-x-hidden bg-background text-foreground">
        <EventEditorV2StickyHeader
          step={step}
          ticketsLabel={labels.tickets}
          badge={badge}
          tabAlerts={tabAlerts}
          onStep={goToStep}
          onRetrySave={
            saveStatus === "error" ? () => void persistDraft() : undefined
          }
        />

        <div className="mx-auto w-full max-w-5xl px-4 py-8 pb-24">
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
            {step === 1 ? (
              <div className="animate-in fade-in duration-200">
                <EventEditorV2InfoStep
                  eventId={eventId}
                  revealField={revealField}
                />
              </div>
            ) : null}
            <div
              hidden={step !== 2}
              className={step === 2 ? "animate-in fade-in duration-200" : undefined}
            >
              <EventEditorV2InventoryStep
                eventId={eventId}
                revealField={revealField}
                active={step === 2}
              />
            </div>
            {step === 3 ? (
              <div className="animate-in fade-in duration-200">
                <EventEditorV2LaunchStep
                  eventId={eventId}
                  isPublished={nowPublished}
                  publishing={busy === "publish"}
                  previewing={busy === "preview"}
                  launchReady={launchReady}
                  launchBlockedReason={launchBlockedReason}
                  onPreview={() => void handlePreviewDraft()}
                  onAbsorbHold={(hold) => {
                    persistHoldRef.current = hold
                    if (!hold) void persistDraft()
                  }}
                />
              </div>
            ) : null}

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
      <EventEditorV2StickyFooter
        step={step}
        busy={working}
        saving={saveStatus === "saving"}
        publishLabel={publishLabel}
        onBack={() => {
          const previous = prevEditorStep(step)
          if (previous) goToStep(previous)
        }}
        onSaveDraft={() => {
          void persistDraft(true).then((result) => {
            if (result.success) {
              toast.success("Borrador guardado")
              return
            }
            toast.error(result.error)
          })
        }}
        onNext={() => {
          const next = nextEditorStep(step)
          if (next) goToStep(next)
        }}
        onPublish={() => void handlePublish()}
      />
      <EventEditorV2SuccessDialog
        open={successOpen}
        eventId={eventId}
        publicUrl={successUrl}
        updated={successUpdated}
        onOpenChange={(open) => {
          setSuccessOpen(open)
          if (!open) revokeLeave()
        }}
      />
      </FormProvider>
    </EventEditorFeeProvider>
  )
}

function OrphanMapTicketGarbageCollector() {
  useOrphanMapTicketGarbageCollector()
  return null
}

function DraftDayRatesSync() {
  useSyncDraftDayRates()
  return null
}
