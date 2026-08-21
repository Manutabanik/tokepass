"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Armchair,
  Building2,
  CalendarClock,
  CreditCard,
  Globe2,
  Lock,
  MapPin,
  MonitorPlay,
  Sparkles,
  Ticket,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form"
import { toast } from "sonner"

import {
  createCompleteEvent,
  saveVenueMapOnly,
  updateCompleteEvent,
  type EditableEventData,
} from "@/app/actions/events"
import { EventAutosaveIndicator } from "@/components/admin/event-autosave-indicator"
import { EventStudioDock } from "@/components/admin/event-studio-dock"
import { EventLivePreview } from "@/components/admin/events/event-live-preview"
import { EventStudioDateTimeField } from "@/components/admin/events/event-studio-datetime-field"
import { EventStudioFlyerField } from "@/components/admin/events/event-studio-flyer-field"
import { EventStudioPurchaseCapField } from "@/components/admin/events/event-studio-purchase-cap-field"
import { EventStudioShell } from "@/components/admin/event-studio-shell"
import { EventStudioStepper } from "@/components/admin/event-studio-stepper"
import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import type { OrganizerVenue } from "@/app/actions/venues"
import { upsertVenue } from "@/app/actions/venues"
import { EventSponsorsManager } from "@/components/admin/event-sponsors-manager"
import { AgendaBuilder } from "@/components/admin/agenda-builder"
import { EventVenueStep } from "@/components/admin/event-venue-step"
import { WizardConflictBanner } from "@/components/admin/wizard-conflict-banner"
import {
  createInventoryTicket,
  UnifiedInventoryPanel,
} from "@/components/admin/unified-inventory-panel"
import { ScheduleDaysBuilder } from "@/components/admin/schedule-days-builder"
import { useEventFormAutosave } from "@/hooks/use-event-form-autosave"
import type { ZoneTierPriceDraft } from "@/lib/stores/event-form-store"
import { useEventFormStore } from "@/lib/stores/event-form-store"
import { Button } from "@/components/ui/button"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { feePercentageFromRate } from "@/lib/pricing/flexible-pricing"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"
import {
  applyMapCapacityToTickets,
  mapBackedTicketsUnchanged,
  syncMapBackedTickets,
  venueMapToPricingMap,
} from "@/lib/seating/venue-map-pricing"
import { InteractiveVenueMapEditor } from "@/components/admin/interactive-venue-map-editor"
import { TokepassStudioOverlay } from "@/components/admin/tokepass-studio-overlay"
import {
  seatingLayoutToVenueMap,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import {
  computeEventCapacityFromForm,
  eventCapacityOverflowMessage,
  ticketsHavePhaseOverflow,
} from "@/lib/inventory/capacity-budget"
import { assignableLogicalSectorIds } from "@/lib/inventory/logical-sectors"
import { useEventCapacity } from "@/hooks/use-event-capacity"
import { ActionableFormError } from "@/components/admin/actionable-form-error"
import {
  GUIDED_ERROR_EVENT,
  mapUnknownError,
  wizardStepFromPath,
  type GuidedErrorAction,
} from "@/lib/errors/error-handler"
import { FIELD_REVIEW_HINT } from "@/lib/errors/app-error"
import {
  applyZodIssuesToForm,
  fieldFromAppError,
  firstFieldErrorPath,
  focusInvalidFormField,
} from "@/lib/errors/form-field"
import { toUserFacingError } from "@/lib/errors/user-facing-error"
import {
  conflictFromPersistError,
  type WizardConflict,
} from "@/lib/seating/venue-map-sku-consistency"
import {
  collectLiveSeatingSectorIds,
  sanitizeEventSubmitPayload,
} from "@/lib/events/sanitize-ticket-tiers"
import { parseVenueMap } from "@/types/venue-map"
import {
  AGE_RESTRICTION_LABELS,
  AGE_RESTRICTION_VALUES,
  MAX_EVENT_FLYER_BYTES,
  draftEventSchema,
  publishEventSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import { defaultInventoryDayId, seedTwoScheduleDays } from "@/lib/event-schedule"
import {
  clampWizardStep,
  editWorkspaceStepKey,
  editWorkspaceStepMeta,
  isLastVisibleWizardStep,
  nextWizardStep,
  prevWizardStep,
  visibleWizardSteps,
  WIZARD_STEP_AGENDA,
  WIZARD_STEP_CONFIG,
  WIZARD_STEP_COUNT,
  WIZARD_STEP_IDENTITY,
  WIZARD_STEP_MAP,
  WIZARD_STEP_TICKETS,
  type WizardVisibility,
} from "@/lib/events/wizard-steps"
import { resolveCategoryIcon } from "@/lib/category-icons"
import {
  STREAMING_VENUE_LOCATION,
  STREAMING_VENUE_NAME,
  isStreamingVenue,
} from "@/lib/venues/streaming-venue"
import { cn } from "@/lib/utils"

const STEP_META = {
  [WIZARD_STEP_IDENTITY]: {
    title: "Identidad",
    description: "Nombre, flyer y categoría",
    icon: Sparkles,
  },
  [WIZARD_STEP_AGENDA]: {
    title: "Cronograma / Artistas",
    description: "Horarios, charlas y lineup",
    icon: CalendarClock,
  },
  [WIZARD_STEP_MAP]: {
    title: "Cita y lugar",
    description: "Fechas, horarios y ubicación",
    icon: MapPin,
  },
  [WIZARD_STEP_TICKETS]: {
    title: "Entradas",
    description: "Tarifas y cupos",
    icon: Ticket,
  },
  [WIZARD_STEP_CONFIG]: {
    title: "Configuración Final",
    description: "Cobros, privacidad y publicar",
    icon: CreditCard,
  },
} as const

const COMPACT_STEP_SHELL = "w-full"

const blankTicket = (): EventFormValues["tickets"][number] => ({
  ...createInventoryTicket("general"),
  name: "",
  price: undefined as unknown as number,
  capacity: undefined as unknown as number,
  phases: [],
})

const defaultValues: EventFormValues = {
  basics: {
    title: "",
    date: "",
    endDate: "",
    description: "",
    flyerName: null,
    visibility: "public",
    isMultiDay: false,
    scheduleDays: [],
    categoryId: "",
    ageRestriction: "" as unknown as EventFormValues["basics"]["ageRestriction"],
    hasSeatingPlan: false,
    hasSchedule: false,
  },
  venue: {
    mode: "new",
    existingVenueId: null,
    zoneType: "general_admission",
    venueName: "",
    venueLocation: "",
    venueCity: "",
    province: "",
    department: "",
    provinceId: null,
    departmentId: null,
    capacity: undefined,
    customMaxCapacity: null,
    rows: undefined,
    seatsPerRow: undefined,
    latitude: null,
    longitude: null,
    seatingBackgroundUrl: null,
    venueMap: null,
    seatingLayout: undefined,
    includesSeatingMap: false,
    saveVenueForReuse: true,
    zones: [],
  },
  tickets: [blankTicket()],
  ticketsDefaultTab: "auto",
  lineup: [],
  maxTicketsPerUser: null,
}

export function EventCreationWizard({
  organizerServiceRate,
  platformFixedFee = 0,
  targetOrganizerId = null,
  venues = [],
  categories = [],
  initialData,
  workspace = false,
  initialStep,
  backHref = "/admin/events",
  backLabel = "Volver al Panel",
  impersonationName = null,
}: {
  organizerServiceRate: number
  platformFixedFee?: number
  targetOrganizerId?: string | null
  venues?: OrganizerVenue[]
  categories?: Array<{ id: string; name: string; slug: string; iconName: string | null }>
  initialData?: EditableEventData
  workspace?: boolean
  initialStep?: number
  backHref?: string
  backLabel?: string
  impersonationName?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isEditing = Boolean(initialData)
  const [activeStep, setActiveStep] = useState(
    workspace ? (initialStep ?? WIZARD_STEP_IDENTITY) : 0,
  )
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [flyerError, setFlyerError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error"
    text: string
    title?: string
    field?: string
    conflict?: WizardConflict
  } | null>(null)
  const [publishConfirm, setPublishConfirm] = useState<{
    open: boolean
    eventId: string
  }>({ open: false, eventId: "" })
  const [venuePricingMap, setVenuePricingMap] = useState<VenuePricingMap>({})
  const [zoneTierPricing, setZoneTierPricing] = useState<ZoneTierPriceDraft[]>(
    () => initialData?.zoneTierPricing ?? [],
  )
  const [localVenues, setLocalVenues] = useState<OrganizerVenue[] | null>(null)
  const [isStudioOpen, setIsStudioOpen] = useState(false)
  const [isStudioClosing, setIsStudioClosing] = useState(false)
  const venueCatalog = localVenues ?? venues

  const form = useForm<EventFormValues>({
    resolver: zodResolver(draftEventSchema) as Resolver<EventFormValues>,
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldUnregister: false,
    defaultValues: initialData?.values ?? defaultValues,
  })

  const capacitySnapshot = useEventCapacity(form)
  const watchedTickets = useWatch({ control: form.control, name: "tickets" })
  const flyerName = useWatch({ control: form.control, name: "basics.flyerName" })
  const watchedTitle = useWatch({ control: form.control, name: "basics.title" })
  const watchedVenueMap = useWatch({ control: form.control, name: "venue.venueMap" })
  const watchedVenueName = useWatch({
    control: form.control,
    name: "venue.venueName",
  })
  const watchedVenueLocation = useWatch({
    control: form.control,
    name: "venue.venueLocation",
  })
  const isStreaming = isStreamingVenue({
    venueName: watchedVenueName,
    venueLocation: watchedVenueLocation,
  })
  const venueSnapshotRef = useRef<EventFormValues["venue"] | null>(null)
  const isMultiDay = useWatch({
    control: form.control,
    name: "basics.isMultiDay",
  })
  const hasSeatingPlan = Boolean(
    useWatch({ control: form.control, name: "basics.hasSeatingPlan" }),
  )
  const hasSchedule = Boolean(
    useWatch({ control: form.control, name: "basics.hasSchedule" }),
  )
  const wizardFlags: WizardVisibility = {
    hasSeatingPlan,
    hasSchedule,
    editWorkspace: workspace,
  }
  const visibleStepIndexes = visibleWizardSteps(wizardFlags)
  const visibleSteps = visibleStepIndexes.map((index) => {
    const meta = STEP_META[index as keyof typeof STEP_META]
    if (!workspace) return { index, ...meta }
    const editMeta = editWorkspaceStepMeta(index)
    return {
      index,
      ...meta,
      title: editMeta.title,
      description: editMeta.description,
    }
  })

  const draftKey = initialData ? `edit:${initialData.id}` : "create"
  const { persistedEventId, flushAutosave } = useEventFormAutosave({
    form,
    draftKey,
    eventId: initialData?.id ?? null,
    initialValues: initialData?.values ?? defaultValues,
    venuePricingMap,
    onVenuePricingMapChange: setVenuePricingMap,
    zoneTierPricing,
    onZoneTierPricingChange: setZoneTierPricing,
    targetOrganizerId,
    serverUpdatedAt: initialData?.updatedAt
      ? Date.parse(initialData.updatedAt)
      : null,
  })

  const clearDraft = useEventFormStore((s) => s.clearDraft)
  const setWizardStep = useEventFormStore((s) => s.setWizardStep)

  useEffect(() => {
    if (workspace) return
    const apply = () => {
      const store = useEventFormStore.getState()
      const persisted =
        typeof store.wizardStep === "number" && Number.isFinite(store.wizardStep)
          ? store.wizardStep
          : 0
      const flags: WizardVisibility = {
        hasSeatingPlan: Boolean(
          store.values?.basics.hasSeatingPlan ??
            form.getValues("basics.hasSeatingPlan"),
        ),
        hasSchedule: Boolean(
          store.values?.basics.hasSchedule ??
            form.getValues("basics.hasSchedule"),
        ),
      }
      if (persisted >= 0 && persisted < WIZARD_STEP_COUNT) {
        const resolved = clampWizardStep(persisted, flags)
        setActiveStep(resolved)
        setWizardStep(resolved)
      }
    }
    const persistApi = useEventFormStore.persist
    if (persistApi.hasHydrated()) {
      queueMicrotask(apply)
      return
    }
    return persistApi.onFinishHydration(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once; el toggle se clampea abajo
  }, [setWizardStep])

  const resolvedStep = clampWizardStep(activeStep, wizardFlags)
  if (activeStep !== resolvedStep) {
    setActiveStep(resolvedStep)
    setWizardStep(resolvedStep)
  }
  if (resolvedStep !== WIZARD_STEP_MAP && isStudioOpen) {
    setIsStudioOpen(false)
  }

  useEffect(() => {
    if (!workspace) return
    const key = editWorkspaceStepKey(resolvedStep)
    router.replace(`${pathname}?step=${key}`, { scroll: false })
  }, [workspace, resolvedStep, pathname, router])

  const inventoryBlocked =
    resolvedStep === WIZARD_STEP_TICKETS &&
    (capacitySnapshot.exceeded || ticketsHavePhaseOverflow(watchedTickets ?? []))

  function applyMapInventory(map: ReturnType<typeof parseVenueMap>) {
    const pricing = venueMapToPricingMap(map)
    setVenuePricingMap(pricing)
    useEventFormStore.getState().setVenuePricingMap(pricing)
    const current = form.getValues("tickets") ?? []
    const next = syncMapBackedTickets(current, map, {
      defaultDayId: defaultInventoryDayId(
        form.getValues("basics.scheduleDays"),
      ),
    })
    if (!mapBackedTicketsUnchanged(current, next)) {
      form.setValue("tickets", next, { shouldDirty: true })
    }
    const derived = computeEventCapacityFromForm(form.getValues()).totalCapacity
    if (derived > 0) {
      form.setValue("venue.capacity", derived, { shouldDirty: true })
    }
  }

  function handleApplySavedVenue(venue: OrganizerVenue) {
    applyMapInventory(
      seatingLayoutToVenueMap(
        venue.seatingLayout,
        parseVenueMap(venue.venueMap),
      ),
    )
  }

  async function moveToStep(nextStep: number) {
    const target = clampWizardStep(nextStep, wizardFlags)
    if (target === activeStep || target === resolvedStep) return
    if (target < 0 || target >= WIZARD_STEP_COUNT) return
    if (resolvedStep === WIZARD_STEP_TICKETS && target !== WIZARD_STEP_TICKETS) {
      const capacity = computeEventCapacityFromForm(form.getValues())
      if (capacity.exceeded) {
        const message = eventCapacityOverflowMessage(capacity)
        form.setError("tickets", { type: "manual", message })
        toast.error("El aforo está excedido", { description: message })
        return
      }
      if (ticketsHavePhaseOverflow(form.getValues("tickets") ?? [])) {
        const message =
          "La suma de los lotes de precio no puede superar la capacidad máxima del ticket."
        form.setError("tickets", { type: "manual", message })
        toast.error("Lotes de precio excedidos", { description: message })
        return
      }
    }
    flushAutosave()
    setActiveStep(target)
    setWizardStep(target)
  }

  const goToWizardStep = useCallback(
    (step: number, sectorId?: string, field?: string) => {
      const resolved = clampWizardStep(step, {
        hasSeatingPlan,
        hasSchedule,
        editWorkspace: workspace,
      })
      if (resolved < 0 || resolved >= WIZARD_STEP_COUNT) return
      setActiveStep(resolved)
      setWizardStep(resolved)
      window.setTimeout(() => {
        const panel = document.getElementById(`event-wizard-step-${resolved}`)
        panel?.scrollIntoView({ behavior: "smooth", block: "start" })
        if (field) {
          focusInvalidFormField(field)
          return
        }
        if (!sectorId) return
        const target = document.querySelector(
          `[data-conflict-sector="${CSS.escape(sectorId)}"]`,
        )
        if (target instanceof HTMLElement) {
          target.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 80)
    },
    [hasSeatingPlan, hasSchedule, setWizardStep, workspace],
  )

  useEffect(() => {
    function onGuided(event: Event) {
      const action = (event as CustomEvent<GuidedErrorAction>).detail
      if (action == null || typeof action.step !== "number") return
      goToWizardStep(action.step, undefined, action.field)
    }
    window.addEventListener(GUIDED_ERROR_EVENT, onGuided)
    return () => window.removeEventListener(GUIDED_ERROR_EVENT, onGuided)
  }, [goToWizardStep])

  function retryLastSave() {
    void form.handleSubmit((data) => onSubmit(data, "draft"))()
  }

  function showWizardConflict(conflict: WizardConflict, title: string, field?: string) {
    setResultMessage({
      type: "error",
      title,
      text: conflict.summary,
      field,
      conflict,
    })
    toast.error(title, {
      duration: 14000,
      description: (
        <div className="space-y-2">
          <p>{conflict.summary}</p>
          <div className="flex flex-col gap-1">
            {conflict.actions.map((action) => (
              <button
                key={`${action.step}-${action.label}`}
                type="button"
                className="h-10 min-h-10 rounded-full border border-white/20 px-3 text-left text-xs font-semibold text-zinc-100"
                onClick={() =>
                  goToWizardStep(action.step, conflict.sectorId, action.field ?? field)
                }
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              className="h-10 min-h-10 rounded-full border border-white/20 px-3 text-left text-xs font-semibold text-zinc-100"
              onClick={() => retryLastSave()}
            >
              Reintentar guardado
            </button>
          </div>
        </div>
      ),
    })
  }

  function reportPersistError(
    raw: string,
    title: string,
    wizardConflict?: WizardConflict,
    code?: string,
    field?: string,
  ) {
    const mapped = mapUnknownError({
      code,
      message: raw,
      title,
      field,
    })
    const resolvedField = field ?? fieldFromAppError(mapped)
    const safeTitle = toUserFacingError(mapped.title || title)
    const safeMessage = toUserFacingError(mapped.message)
    if (resolvedField) {
      form.setError(resolvedField as never, {
        type: "manual",
        message: FIELD_REVIEW_HINT,
      })
    }
    const conflict =
      wizardConflict ??
      conflictFromPersistError(mapped.message) ??
      (mapped.action
        ? { summary: mapped.message, actions: [mapped.action] }
        : null)
    if (conflict) {
      showWizardConflict(conflict, safeTitle, resolvedField)
      window.setTimeout(() => {
        if (mapped.action) {
          goToWizardStep(mapped.action.step, conflict.sectorId, resolvedField)
        } else {
          focusInvalidFormField(resolvedField)
        }
      }, 80)
      return
    }
    setResultMessage({
      type: "error",
      title: safeTitle,
      text: safeMessage,
      field: resolvedField,
    })
    toast.error(safeTitle, {
      duration: 14000,
      description: (
        <div className="space-y-2">
          <p>{safeMessage}</p>
          <div className="flex flex-col gap-1">
            {resolvedField || mapped.action ? (
              <button
                type="button"
                className="h-10 min-h-10 rounded-full border border-white/20 px-3 text-left text-xs font-semibold text-zinc-100"
                onClick={() => {
                  if (mapped.action) {
                    goToWizardStep(mapped.action.step, undefined, resolvedField)
                    return
                  }
                  focusInvalidFormField(resolvedField)
                }}
              >
                Corregir campo
              </button>
            ) : null}
            <button
              type="button"
              className="h-10 min-h-10 rounded-full border border-white/20 px-3 text-left text-xs font-semibold text-zinc-100"
              onClick={() => retryLastSave()}
            >
              Reintentar guardado
            </button>
          </div>
        </div>
      ),
    })
    window.setTimeout(() => focusInvalidFormField(resolvedField), 80)
  }

  async function onSaveIdentity(data: EventFormValues) {
    setResultMessage(null)
    const titleOk = await form.trigger("basics.title")
    if (!titleOk || data.basics.title.trim().length < 3) {
      toast.error("Revisá el título del evento")
      setActiveStep(0)
      return
    }
    if (flyerFile && flyerFile.size > MAX_EVENT_FLYER_BYTES) {
      const message =
        "El flyer supera los 5MB. Comprimilo o elegí otra imagen."
      setFlyerError(message)
      form.setError("basics.flyerName", { type: "manual", message })
      setActiveStep(0)
      return
    }

    const formData = new FormData()
    formData.set("payload", JSON.stringify(data))
    formData.set("draftMode", "1")
    formData.set("identityOnly", "1")
    if (flyerFile) formData.set("flyer", flyerFile)
    if (targetOrganizerId) formData.set("targetOrganizerId", targetOrganizerId)

    const editingId = initialData?.id ?? persistedEventId
    const result = editingId
      ? await updateCompleteEvent(
          (() => {
            formData.set("eventId", editingId)
            return formData
          })(),
        )
      : await createCompleteEvent(formData)

    if (!result.success) {
      reportPersistError(
        result.error,
        result.title ?? "No se pudo guardar la identidad",
        result.wizardConflict,
        result.code,
        result.field,
      )
      return
    }

    if (result.eventId) {
      useEventFormStore.getState().setEventId(result.eventId)
    }
    setResultMessage({ type: "success", text: "Identidad guardada." })
    toast.success("Identidad guardada", {
      description: "El título y los datos del evento quedaron actualizados.",
    })
  }

  async function onSubmit(
    data: EventFormValues,
    intent: "draft" | "publish" = "draft",
  ): Promise<boolean> {
    setResultMessage(null)

    if (intent === "draft" && activeStep === 0 && !workspace) {
      await onSaveIdentity(data)
      return true
    }

    const capacity = computeEventCapacityFromForm(data)
    if (capacity.exceeded) {
      const message = eventCapacityOverflowMessage(capacity)
      form.setError("tickets", { type: "manual", message })
      toast.error("El aforo está excedido", { description: message })
      setResultMessage({ type: "error", text: message })
      goToWizardStep(2)
      return false
    }

    if (intent === "publish") {
      const strict = publishEventSchema.safeParse(data)
      if (!strict.success) {
        form.clearErrors()
        applyZodIssuesToForm(form.setError, strict.error.issues)
        const first = strict.error.issues[0]
        const fieldPath = first?.path.map(String).join(".") ?? ""
        const message =
          first?.message ??
          "Completá los datos obligatorios para publicar."
        const mapped = mapUnknownError(message)
        toast.error("Todavía no se puede publicar", {
          description: mapped.message,
        })
        setResultMessage({ type: "error", text: mapped.message })
        goToWizardStep(
          mapped.action?.step ?? wizardStepFromPath(first?.path ?? []),
        )
        window.setTimeout(() => {
          focusInvalidFormField(fieldPath || fieldFromAppError(mapped))
        }, 80)
        return false
      }
    }

    if (flyerFile && flyerFile.size > MAX_EVENT_FLYER_BYTES) {
      const message =
        "El flyer supera los 5MB. Comprimilo o elegí otra imagen."
      setFlyerError(message)
      form.setError("basics.flyerName", { type: "manual", message })
      setActiveStep(0)
      return false
    }

    let payloadData = data
    const canPersistVenue =
      data.venue.mode === "new" &&
      data.venue.saveVenueForReuse &&
      data.venue.venueName.trim().length >= 2
    if (canPersistVenue) {
      const persist = await upsertVenue({
        id: data.venue.existingVenueId,
        name: data.venue.venueName.trim(),
        location:
          [data.venue.venueLocation, data.venue.venueCity]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(", ") || data.venue.venueName.trim(),
        city: data.venue.venueCity?.trim() || undefined,
        latitude: data.venue.latitude ?? null,
        longitude: data.venue.longitude ?? null,
        capacity: data.venue.capacity ?? 1,
        zones: data.venue.zones,
        seatingBackgroundUrl: data.venue.seatingBackgroundUrl ?? null,
        seatingLayout: Array.isArray(data.venue.seatingLayout)
          ? (data.venue.seatingLayout as never)
          : undefined,
        venueMap: data.venue.venueMap
          ? (data.venue.venueMap as never)
          : undefined,
      })
      if (!persist.success) {
        reportPersistError(
          persist.error,
          "No se pudieron guardar los cambios en el lugar",
        )
        return false
      }
      payloadData = {
        ...data,
        venue: {
          ...data.venue,
          mode: "existing",
          existingVenueId: persist.data.id,
          saveVenueForReuse: false,
        },
      }
      form.setValue("venue.mode", "existing")
      form.setValue("venue.existingVenueId", persist.data.id)
    }

    const editingId = initialData?.id ?? persistedEventId
    const liveSectorIds = collectLiveSeatingSectorIds({
      venueMap: payloadData.venue.venueMap,
      seatingLayout: payloadData.venue.seatingLayout,
      extraIds: assignableLogicalSectorIds(
        payloadData.venue.zones,
        payloadData.venue.venueMap,
      ),
    })
    payloadData = sanitizeEventSubmitPayload(payloadData, {
      mode: editingId ? "update" : "create",
      persistedIds: (initialData?.values.tickets ?? [])
        .map((tier) => tier.id)
        .filter((id): id is string => Boolean(id)),
      liveSectorIds,
    })
    payloadData = {
      ...payloadData,
      tickets: applyMapCapacityToTickets(
        payloadData.tickets,
        parseVenueMap(payloadData.venue.venueMap),
      ),
    }
    form.setValue("tickets", payloadData.tickets, { shouldDirty: false })

    const formData = new FormData()
    formData.set("payload", JSON.stringify(payloadData))
    if (intent === "draft") {
      formData.set("draftMode", "1")
    }
    if (flyerFile) {
      formData.set("flyer", flyerFile)
    }
    if (targetOrganizerId) {
      formData.set("targetOrganizerId", targetOrganizerId)
    }

    if (initialData?.id || persistedEventId) {
      formData.set("eventId", initialData?.id ?? persistedEventId!)
    }

    const result = editingId
      ? await updateCompleteEvent(formData)
      : await createCompleteEvent(formData)

    if (!result.success) {
      reportPersistError(
        result.error,
        result.title ??
          (isEditing || editingId
            ? "No se pudieron guardar los cambios"
            : "No se pudo crear el evento"),
        result.wizardConflict,
        result.code,
        result.field,
      )
      return false
    }

    // Persiste matriz Zona × Tier
    if (zoneTierPricing.length > 0) {
      const { syncZoneTierPricing } = await import("@/app/actions/event-autosave")
      await syncZoneTierPricing({
        eventId: result.eventId,
        rows: zoneTierPricing.filter(
          (row) => !row.sectorKey || liveSectorIds.has(row.sectorKey),
        ),
      })
    }

    if (result.eventId) {
      useEventFormStore.getState().setEventId(result.eventId)
    }

    if (intent === "publish") {
      clearDraft(draftKey)
      toast.success(
        isEditing ? "Cambios guardados" : "Borrador listo",
        {
          description: "Confirmá el envío a revisión de TokePass.",
        },
      )
      setPublishConfirm({ open: true, eventId: result.eventId })
      return true
    }

    toast.success("Cambios guardados", {
      description: flyerFile
        ? "Borrador con flyer listo. Completá barra y multimedia cuando quieras."
        : "Podés seguir editando en esta pestaña.",
    })
    return true
  }

  function persistWorkspaceMap(next: ReturnType<typeof parseVenueMap>) {
    form.setValue("venue.venueMap", next, { shouldDirty: true })
    form.setValue("venue.seatingLayout", venueMapToSeatingLayout(next), {
      shouldDirty: true,
    })
    form.setValue("venue.includesSeatingMap", true, { shouldDirty: true })
    form.setValue("basics.hasSeatingPlan", true, { shouldDirty: true })
    applyMapInventory(next)
  }

  async function closeStudio() {
    if (isStudioClosing) return
    setIsStudioClosing(true)
    try {
      const map = parseVenueMap(form.getValues("venue.venueMap"))
      persistWorkspaceMap(map)
      flushAutosave()
      const eventId = initialData?.id ?? persistedEventId
      if (eventId) {
        const result = await saveVenueMapOnly(eventId, map)
        if (!result.success) {
          toast.error("No se pudo guardar el mapa", {
            description: result.error,
          })
          return
        }
      }
      setIsStudioOpen(false)
    } finally {
      setIsStudioClosing(false)
    }
  }

  function setEventModality(online: boolean) {
    if (online) {
      if (!isStreaming) {
        venueSnapshotRef.current = form.getValues("venue")
      }
      form.setValue("venue.mode", "new", { shouldDirty: true })
      form.setValue("venue.existingVenueId", null, { shouldDirty: true })
      form.setValue("venue.venueName", STREAMING_VENUE_NAME, {
        shouldDirty: true,
      })
      form.setValue("venue.venueLocation", STREAMING_VENUE_LOCATION, {
        shouldDirty: true,
      })
      form.setValue("venue.venueCity", "", { shouldDirty: true })
      form.setValue("venue.latitude", null, { shouldDirty: true })
      form.setValue("venue.longitude", null, { shouldDirty: true })
      form.setValue("basics.hasSeatingPlan", false, { shouldDirty: true })
      form.setValue("venue.includesSeatingMap", false, { shouldDirty: true })
      form.setValue("venue.zoneType", "general_admission", { shouldDirty: true })
      return
    }
    const snapshot = venueSnapshotRef.current
    if (snapshot && !isStreamingVenue(snapshot)) {
      form.setValue("venue", snapshot, { shouldDirty: true })
      return
    }
    if (isStreaming) {
      form.setValue("venue.venueName", "", { shouldDirty: true })
      form.setValue("venue.venueLocation", "", { shouldDirty: true })
      form.setValue("venue.mode", "new", { shouldDirty: true })
      form.setValue("venue.existingVenueId", null, { shouldDirty: true })
    }
  }

  const studioSteps = visibleSteps.map((step) => ({
    index: step.index,
    label: step.title,
  }))
  const studioActive = Math.max(0, visibleStepIndexes.indexOf(resolvedStep))

  return (
    <>
    <Form {...form}>
      <form
        className="flex h-full min-h-0 w-full flex-1 flex-col overflow-x-hidden"
        onSubmit={form.handleSubmit(
          (data) => onSubmit(data, "draft"),
          (errors) => {
            const fieldPath = firstFieldErrorPath(errors)
            const step = wizardStepFromPath(
              fieldPath ? fieldPath.split(".") : [],
            )
            goToWizardStep(step)
            window.setTimeout(() => {
              focusInvalidFormField(fieldPath)
            }, 80)
            if (activeStep === 0 || step === 0) {
              toast.error("Revisá el nombre, las fechas o el flyer.")
              return
            }
            const capacity = computeEventCapacityFromForm(form.getValues())
            if (capacity.exceeded) {
              const message = eventCapacityOverflowMessage(capacity)
              toast.error("El aforo está excedido", { description: message })
              goToWizardStep(WIZARD_STEP_TICKETS)
              return
            }
            toast.error("Revisá los datos obligatorios.")
          },
        )}
      >
        <EventStudioShell
          backHref={backHref}
          backLabel={backLabel}
          stepper={
            <EventStudioStepper
              steps={studioSteps}
              activeIndex={studioActive}
              onSelect={(index) => void moveToStep(index)}
            />
          }
          status={<EventAutosaveIndicator />}
          banner={
            impersonationName ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-100"
              >
                <p className="text-sm font-semibold text-amber-200">
                  {workspace ? "Editando" : "Creando"} a nombre de{" "}
                  {impersonationName}
                </p>
              </div>
            ) : null
          }
          preview={
            <EventLivePreview
              control={form.control}
              categories={categories}
              flyerFile={flyerFile}
              existingFlyerUrl={
                flyerName ? initialData?.flyerUrl ?? null : null
              }
            />
          }
          dock={
            <EventStudioDock
              canGoBack={resolvedStep !== WIZARD_STEP_IDENTITY}
              isLast={isLastVisibleWizardStep(resolvedStep, wizardFlags)}
              isEditing={isEditing}
              submitting={form.formState.isSubmitting}
              nextDisabled={inventoryBlocked}
              onBack={() =>
                void moveToStep(prevWizardStep(resolvedStep, wizardFlags))
              }
              onNext={() =>
                void moveToStep(nextWizardStep(resolvedStep, wizardFlags))
              }
              onPublish={() => void onSubmit(form.getValues(), "publish")}
            />
          }
        >
        <Tabs
          value={String(resolvedStep)}
          onValueChange={(value) => {
            const next = Number(value)
            if (!Number.isFinite(next) || next === resolvedStep) return
            void moveToStep(next)
          }}
          className="flex flex-col gap-0 overflow-x-hidden"
        >
            <TabsContent
              keepMounted
              value="0"
              id="event-wizard-step-0"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <div>
              <CardHeader className="px-0 pt-2">
                <CardTitle className="mb-1 text-2xl font-bold text-foreground">
                  Identidad del evento
                </CardTitle>
                <CardDescription className="border-b border-border pb-4 text-sm text-muted-foreground">
                  Nombre, flyer y categoría. Completá los datos y subí el
                  flyer sin que se pisen.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 items-start gap-6 overflow-x-hidden px-0 py-6 md:grid-cols-12">
                <div className="min-w-0 space-y-6 md:col-span-7">
                  <FormField
                    control={form.control}
                    name="basics.title"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-2">
                        <FormLabel
                          htmlFor="event-title"
                          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
                        >
                          Título del evento
                        </FormLabel>
                        <Input
                          {...field}
                          id="event-title"
                          data-field="basics.title"
                          placeholder="Nombre impactante de tu evento"
                          className="w-full rounded-lg border border-border bg-card p-3 text-base text-foreground md:text-sm"
                        />
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.categoryId"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                          Categoría
                        </FormLabel>
                        {categories.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No hay categorias activas.
                          </p>
                        ) : (
                          <div
                          className="flex min-w-0 flex-wrap gap-2"
                          data-field="basics.categoryId"
                          >
                            {categories.map((category) => {
                              const selected = field.value === category.id
                              const Icon = resolveCategoryIcon(category.iconName)
                              return (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => field.onChange(category.id)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-base transition md:text-sm",
                                    selected
                                      ? "border-emerald-400/60 bg-emerald-500/15 font-semibold text-emerald-200"
                                      : "border-border bg-card/50 text-muted-foreground hover:border-emerald-500/30 hover:text-foreground",
                                  )}
                                >
                                  <Icon className="size-3.5" />
                                  {category.name}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Lista definida por TokePass. No se pueden crear
                          etiquetas libres.
                        </p>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.ageRestriction"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                          Restricción de edad
                        </FormLabel>
                        <div
                          className="flex flex-wrap gap-2"
                          data-field="basics.ageRestriction"
                        >
                          {AGE_RESTRICTION_VALUES.map((value) => {
                            const selected = field.value === value
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => field.onChange(value)}
                                className={cn(
                                  "inline-flex min-w-16 items-center justify-center rounded-full border px-3 py-2 text-base font-semibold transition md:text-sm",
                                  selected
                                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                                    : "border-border bg-card/50 text-muted-foreground hover:border-emerald-500/30 hover:text-foreground",
                                )}
                              >
                                {AGE_RESTRICTION_LABELS[value]}
                              </button>
                            )
                          })}
                        </div>
                        <FormDescription className="text-xs text-muted-foreground">
                          Se muestra en la ficha publica. El control de DNI es
                          responsabilidad de la puerta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.description"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel
                          htmlFor="event-description"
                          className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground"
                        >
                          Descripción
                        </FormLabel>
                        <Textarea
                          {...field}
                          id="event-description"
                          data-field="basics.description"
                          placeholder="Cuenta qué hace única a esta experiencia..."
                          className="min-h-[160px] w-full resize-y rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-base text-foreground shadow-inner transition-all placeholder:text-slate-500 dark:placeholder:text-muted-foreground dark:placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none md:text-sm"
                        />
                        <FormDescription className="text-muted-foreground">
                          Este texto será visible en la página de venta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="min-w-0 space-y-2 md:col-span-5">
                  <EventStudioFlyerField
                    flyerFile={flyerFile}
                    existingFlyerUrl={
                      flyerName ? initialData?.flyerUrl ?? null : null
                    }
                    existingTitle={initialData?.title}
                    error={
                      flyerError ??
                      form.formState.errors.basics?.flyerName?.message
                    }
                    onFile={(file) => {
                      setFlyerError(null)
                      form.clearErrors("basics.flyerName")
                      setFlyerFile(file)
                      form.setValue("basics.flyerName", file.name, {
                        shouldDirty: true,
                      })
                    }}
                    onClear={() => {
                      setFlyerError(null)
                      form.clearErrors("basics.flyerName")
                      setFlyerFile(null)
                      form.setValue("basics.flyerName", null, {
                        shouldDirty: true,
                      })
                    }}
                  />
                </div>
                <div className="min-w-0 md:col-span-12">
                  <EventSponsorsManager
                    eventId={initialData?.id ?? persistedEventId}
                  />
                </div>
              </CardContent>
              </div>
            </TabsContent>

            <TabsContent
              keepMounted
              value="1"
              id="event-wizard-step-1"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="px-0 pt-2">
                <CardTitle className="text-xl text-foreground">
                  Cita y lugar
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Fechas, ubicación y, si hace falta, mapa numerado o agenda.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7 px-0 py-6">
                <div className="space-y-2">
                  <p className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Modalidad
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setEventModality(false)}
                      className={cn(
                        "rounded-2xl border px-3 py-3 text-left transition",
                        !isStreaming
                          ? "border-emerald-400/50 bg-emerald-500/10"
                          : "border-border bg-card/40 hover:border-emerald-500/30",
                      )}
                    >
                      <MapPin className="mb-2 size-4 text-emerald-400" />
                      <span className="block text-sm font-semibold text-foreground">
                        Evento Presencial
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Recinto fisico y puerta.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventModality(true)}
                      className={cn(
                        "rounded-2xl border px-3 py-3 text-left transition",
                        isStreaming
                          ? "border-emerald-400/50 bg-emerald-500/10"
                          : "border-border bg-card/40 hover:border-emerald-500/30",
                      )}
                    >
                      <MonitorPlay className="mb-2 size-4 text-emerald-400" />
                      <span className="block text-sm font-semibold text-foreground">
                        Streaming / Online
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Sin recinto fisico.
                      </span>
                    </button>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="basics.isMultiDay"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/40 px-4 py-3">
                      <div>
                        <FormLabel className="text-sm font-medium text-foreground">
                          Evento de Multiples Jornadas / Festival
                        </FormLabel>
                        <FormDescription className="text-xs text-muted-foreground">
                          Activalo para varias noches o dias.
                        </FormDescription>
                      </div>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked)
                          if (checked) {
                            const current = form.getValues(
                              "basics.scheduleDays",
                            )
                            if (current.length < 2) {
                              form.setValue(
                                "basics.scheduleDays",
                                seedTwoScheduleDays(
                                  form.getValues("basics.date") || "",
                                ),
                                {
                                  shouldDirty: true,
                                  shouldTouch: true,
                                  shouldValidate: false,
                                },
                              )
                            }
                          } else {
                            const days = form.getValues("basics.scheduleDays")
                            const first = days[0]
                            if (first?.startTime) {
                              form.setValue("basics.date", first.startTime, {
                                shouldDirty: true,
                              })
                            }
                            if (first?.endTime) {
                              form.setValue("basics.endDate", first.endTime, {
                                shouldDirty: true,
                              })
                            }
                            form.setValue("basics.scheduleDays", [], {
                              shouldDirty: true,
                            })
                          }
                        }}
                        className="data-checked:bg-emerald-500"
                        aria-label="Evento de multiples jornadas o festival"
                      />
                    </FormItem>
                  )}
                />

                {isMultiDay ? (
                  <ScheduleDaysBuilder control={form.control} />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="basics.date"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel
                            htmlFor="event-date"
                            className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground"
                          >
                            Inicio
                          </FormLabel>
                          <EventStudioDateTimeField
                            id="event-date"
                            fieldName="basics.date"
                            value={field.value}
                            onChange={field.onChange}
                          />
                          <FormMessage>{fieldState.error?.message}</FormMessage>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="basics.endDate"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel
                            htmlFor="event-end-date"
                            className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground"
                          >
                            Finalizacion
                          </FormLabel>
                          <EventStudioDateTimeField
                            id="event-end-date"
                            fieldName="basics.endDate"
                            value={field.value}
                            onChange={field.onChange}
                          />
                          <FormDescription className="text-xs text-muted-foreground">
                            Debe ser posterior al inicio.
                          </FormDescription>
                          <FormMessage>{fieldState.error?.message}</FormMessage>
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="basics.hasSchedule"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-4 rounded-2xl border border-border bg-card/40 px-4 py-3">
                      <div className="min-w-0">
                        <FormLabel className="text-sm font-semibold text-foreground">
                          Cronograma / agenda
                        </FormLabel>
                        <FormDescription className="text-xs text-muted-foreground">
                          Charlas, shows o itinerario por horarios.
                        </FormDescription>
                      </div>
                      <Switch
                        checked={Boolean(field.value)}
                        onCheckedChange={(checked) => {
                          field.onChange(checked)
                        }}
                        className="data-checked:bg-violet-500"
                        aria-label="Habilitar cronograma o agenda del evento"
                      />
                    </FormItem>
                  )}
                />

                {isStreaming ? (
                  <div className="rounded-2xl border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
                    El evento se publica como {STREAMING_VENUE_NAME}. No hace
                    falta recinto ni mapa de asientos.
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <p className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        Ubicacion y recinto
                      </p>
                      <EventVenueStep
                        form={form}
                        eventId={initialData?.id ?? persistedEventId}
                        venues={venueCatalog}
                        onVenuesChange={setLocalVenues}
                        onAppliedVenue={handleApplySavedVenue}
                        onMapInventoryChange={applyMapInventory}
                        catalogOrganizerId={
                          targetOrganizerId ?? initialData?.organizerId ?? null
                        }
                        focus="location"
                        variant="studio"
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="basics.hasSeatingPlan"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent px-4 py-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/15 text-emerald-300">
                              <Armchair className="size-4" aria-hidden="true" />
                            </span>
                            <div className="space-y-1">
                              <FormLabel className="text-sm font-semibold leading-snug text-foreground">
                                Requiere Mapa de Asientos Numerados
                              </FormLabel>
                              <FormDescription className="text-xs text-muted-foreground">
                                Butacas, mesas o tablones con numeracion.
                              </FormDescription>
                            </div>
                          </div>
                          <Switch
                            checked={Boolean(field.value)}
                            onCheckedChange={(checked) => {
                              field.onChange(checked)
                              form.setValue(
                                "venue.includesSeatingMap",
                                checked,
                                { shouldDirty: true },
                              )
                              form.setValue(
                                "venue.zoneType",
                                checked
                                  ? "reserved_seating"
                                  : "general_admission",
                                { shouldDirty: true },
                              )
                              if (!checked) {
                                const currentTickets =
                                  form.getValues("tickets") ?? []
                                if (
                                  currentTickets.some(
                                    (tier) => tier.seatingSectorId,
                                  )
                                ) {
                                  form.setValue(
                                    "tickets",
                                    currentTickets.map((tier) => ({
                                      ...tier,
                                      seatingSectorId: null,
                                    })),
                                    { shouldDirty: true },
                                  )
                                }
                              }
                            }}
                            className="data-checked:bg-emerald-500"
                            aria-label="Requiere mapa de asientos numerados"
                          />
                        </FormItem>
                      )}
                    />

                    {hasSeatingPlan ? (
                      <Button
                        type="button"
                        size="lg"
                        className="relative h-12 w-full bg-gradient-to-r from-emerald-500 to-cyan-500 text-base font-semibold text-zinc-950 hover:from-emerald-400 hover:to-cyan-400 md:text-sm"
                        onClick={() => setIsStudioOpen(true)}
                      >
                        <span className="absolute -top-2 right-3 rounded-full bg-zinc-950 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300 uppercase ring-1 ring-emerald-400/40">
                          Destacado
                        </span>
                        Abrir Disenador de Mapa de Recinto
                      </Button>
                    ) : null}
                  </>
                )}
                {hasSchedule ? (
                  <AgendaBuilder eventId={initialData?.id ?? persistedEventId} />
                ) : null}
              </CardContent>
              {isStudioOpen ? (
                <TokepassStudioOverlay
                  open={isStudioOpen}
                  closing={isStudioClosing}
                  onClose={() => void closeStudio()}
                >
                  <InteractiveVenueMapEditor
                    variant="studio"
                    eventTitle={watchedTitle || initialData?.title || "Evento"}
                    onEventTitleChange={(title) =>
                      form.setValue("basics.title", title, {
                        shouldDirty: true,
                      })
                    }
                    value={parseVenueMap(watchedVenueMap)}
                    tickets={watchedTickets}
                    saving={form.formState.isSubmitting || isStudioClosing}
                    onChange={(next) => persistWorkspaceMap(next)}
                    onAutoSave={(next) => persistWorkspaceMap(next)}
                    onSave={async (next) => {
                      persistWorkspaceMap(next)
                      const eventId = initialData?.id ?? persistedEventId
                      if (!eventId) {
                        throw new Error(
                          "No hay un evento para guardar el mapa.",
                        )
                      }
                      const result = await saveVenueMapOnly(eventId, next)
                      if (!result.success) {
                        throw new Error(result.error)
                      }
                    }}
                  />
                </TokepassStudioOverlay>
              ) : null}
            </TabsContent>

            <TabsContent
              keepMounted
              value="2"
              id="event-wizard-step-2"
              className={cn(
                "animate-in fade-in slide-in-from-right-2 duration-300",
                workspace && "h-full overflow-y-auto",
              )}
            >
              <div className={COMPACT_STEP_SHELL}>
              <CardHeader className="border-b border-zinc-200 px-0 py-6 dark:border-white/8">
                <CardTitle className="text-xl text-foreground">
                  Entradas y combos
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  El mapa y las entradas generales suman al aforo por separado.
                  Una general puede quedar como inventario libre, sin sector.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-0 py-7">
                <EventStudioPurchaseCapField form={form} />
                <UnifiedInventoryPanel
                  form={form}
                  eventId={initialData?.id ?? persistedEventId}
                  feePercentage={feePercentageFromRate(organizerServiceRate)}
                  fixedFee={platformFixedFee}
                />
                <FormMessage>
                  {form.formState.errors.tickets?.message ??
                    form.formState.errors.tickets?.root?.message}
                </FormMessage>
              </CardContent>
              <CardHeader className="border-b border-border px-0 py-4">
                <CardTitle className="text-lg text-foreground">
                  Visibilidad
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 px-0 py-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <CreditCard className="size-4 text-emerald-700 dark:text-emerald-400" />
                      Mercado Pago
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Pago online con tarjeta, débito y dinero en cuenta.
                      La comisión se incluye en el precio público.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Building2 className="size-4 text-emerald-700 dark:text-emerald-400" />
                      Transferencia / POS
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      En boletería física podés cobrar en efectivo, tarjeta o
                      transferencia. El evento publicado habilita el POS.
                    </p>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="basics.visibility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                        Visibilidad del evento
                      </FormLabel>
                      <div className="inline-flex w-full flex-col gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-1.5 sm:w-auto sm:flex-row">
                        {(
                          [
                            {
                              value: "public" as const,
                              label: "Evento público",
                              hint: "Visible en portada TokePass",
                              icon: Globe2,
                            },
                            {
                              value: "private" as const,
                              label: "Evento privado",
                              hint: "Solo con el enlace directo",
                              icon: Lock,
                            },
                          ] as const
                        ).map((option) => {
                          const selected = field.value === option.value
                          const Icon = option.icon
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => field.onChange(option.value)}
                              className={cn(
                                "flex flex-1 items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm transition-all",
                                selected
                                  ? "border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800 font-medium text-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800/40 hover:text-foreground",
                              )}
                            >
                              <Icon
                                className={cn(
                                  "size-4 shrink-0",
                                  selected
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-muted-foreground",
                                )}
                                aria-hidden="true"
                              />
                              <span>
                                <span className="block font-medium">
                                  {option.label}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {option.hint}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </FormItem>
                  )}
                />

                {resultMessage?.type === "success" ? (
                  <p
                    role="status"
                    className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300"
                  >
                    {resultMessage.text}
                  </p>
                ) : null}
              </CardContent>
              </div>
            </TabsContent>

            {resultMessage?.type === "error" ? (
              <div className="px-4 pb-2 lg:px-8">
                {resultMessage.conflict ? (
                  <WizardConflictBanner
                    title={resultMessage.title}
                    conflict={resultMessage.conflict}
                    onGoToStep={goToWizardStep}
                    onRetry={() => retryLastSave()}
                  />
                ) : (
                  <ActionableFormError
                    title={resultMessage.title ?? "No se pudieron guardar los cambios"}
                    description={toUserFacingError(resultMessage.text)}
                    onFixField={
                      resultMessage.field
                        ? () => {
                            if (resultMessage.conflict) return
                            focusInvalidFormField(resultMessage.field)
                          }
                        : undefined
                    }
                    onRetry={() => retryLastSave()}
                  />
                )}
              </div>
            ) : null}
        </Tabs>
        </EventStudioShell>
      </form>
    </Form>

    {publishConfirm.open ? (
      <PublishEventConfirmDialog
        eventId={publishConfirm.eventId}
        open={publishConfirm.open}
        onOpenChange={(open) =>
          setPublishConfirm((current) => ({ ...current, open }))
        }
        onPublished={() => {
          router.push(`/admin/events/${publishConfirm.eventId}`)
          router.refresh()
        }}
      />
    ) : null}
    </>
  )
}
