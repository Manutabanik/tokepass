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
  updateCompleteEvent,
  type EditableEventData,
} from "@/app/actions/events"
import { EventAutosaveIndicator } from "@/components/admin/event-autosave-indicator"
import { EventCapacityHeader } from "@/components/admin/event-capacity-header"
import { EventStudioDock } from "@/components/admin/event-studio-dock"
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
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  consolidateEventTicketsForPersist,
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
import { uncoveredScheduleDays } from "@/lib/inventory/day-ticket-coverage"
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
import {
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
  STUDIO_MODALITY_ACTIVE_CLASS,
  STUDIO_MODALITY_IDLE_CLASS,
  STUDIO_SELECT_CONTENT_CLASS,
} from "@/lib/admin/studio-form-styles"

const STEP_META = {
  [WIZARD_STEP_IDENTITY]: {
    title: "Datos principales",
    description: "Nombre, flyer y detalles del show",
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
    title: "Entradas y precios",
    description: "Lotes, abonos y cupos",
    icon: Ticket,
  },
  [WIZARD_STEP_CONFIG]: {
    title: "Publicar y cobrar",
    description: "Comisiones y privacidad",
    icon: CreditCard,
  },
} as const

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
    deliveryMode: "PRESENCIAL",
    accessLink: "",
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
    mode: "onChange",
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
  const watchedDeliveryMode = useWatch({
    control: form.control,
    name: "basics.deliveryMode",
  })
  const isStreaming =
    watchedDeliveryMode === "ONLINE" ||
    isStreamingVenue({
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
  const {
    persistedEventId,
    flushAutosave,
    cancelPendingAutosave,
    waitForInFlightAutosave,
    markSaved,
  } = useEventFormAutosave({
    form,
    draftKey,
    eventId: initialData?.id ?? null,
    initialValues: initialData?.values ?? defaultValues,
    venuePricingMap,
    onVenuePricingMapChange: setVenuePricingMap,
    zoneTierPricing,
    onZoneTierPricingChange: setZoneTierPricing,
    targetOrganizerId,
    flyerFile,
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
  if (resolvedStep !== WIZARD_STEP_CONFIG && isStudioOpen) {
    setIsStudioOpen(false)
  }

  useEffect(() => {
    if (!workspace) return
    const key = editWorkspaceStepKey(resolvedStep)
    router.replace(`${pathname}?step=${key}`, { scroll: false })
  }, [workspace, resolvedStep, pathname, router])

  const scheduleDaysForGuard =
    useWatch({ control: form.control, name: "basics.scheduleDays" }) ?? []
  const inventoryBlocked =
    resolvedStep === WIZARD_STEP_TICKETS &&
    (capacitySnapshot.exceeded ||
      ticketsHavePhaseOverflow(watchedTickets ?? []) ||
      (scheduleDaysForGuard.length >= 2 &&
        uncoveredScheduleDays(scheduleDaysForGuard, watchedTickets ?? [])
          .length > 0))

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
    const primary = conflict.actions[0]
    toast.error(title, {
      duration: 5000,
      description: conflict.summary,
      action: primary
        ? {
            label: primary.label,
            onClick: () =>
              goToWizardStep(primary.step, conflict.sectorId, primary.field ?? field),
          }
        : {
            label: "Reintentar",
            onClick: () => retryLastSave(),
          },
    })
  }

  function reportPersistError(
    raw: string,
    title: string,
    wizardConflict?: WizardConflict,
    code?: string,
    field?: string,
    actionHint?: string,
  ) {
    const mapped = mapUnknownError({
      code,
      message: raw,
      title,
      field,
    })
    const resolvedField = field ?? fieldFromAppError(mapped)
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
      showWizardConflict(conflict, toUserFacingError(mapped.title || title), resolvedField)
      window.setTimeout(() => {
        if (mapped.action) {
          goToWizardStep(mapped.action.step, conflict.sectorId, resolvedField)
        } else {
          focusInvalidFormField(resolvedField)
        }
      }, 80)
      return
    }
    toast.error(safeMessage, {
      duration: 5000,
      description:
        actionHint?.trim() || mapped.actionHint || FIELD_REVIEW_HINT,
      action:
        resolvedField || mapped.action
          ? {
              label: mapped.action?.label ?? "Corregir campo",
              onClick: () => {
                if (mapped.action) {
                  goToWizardStep(mapped.action.step, undefined, resolvedField)
                  return
                }
                focusInvalidFormField(resolvedField)
              },
            }
          : {
              label: "Reintentar",
              onClick: () => retryLastSave(),
            },
    })
    window.setTimeout(() => {
      if (resolvedField) form.setFocus(resolvedField as never)
      focusInvalidFormField(resolvedField)
    }, 80)
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
    markSaved(data)
    setResultMessage({ type: "success", text: "Datos principales guardados." })
    toast.success("Datos principales guardados", {
      description: "El título y los datos del evento quedaron actualizados.",
    })
  }

  function buildConsolidatedPayload(data: EventFormValues): EventFormValues {
    const editingId = initialData?.id ?? persistedEventId
    let next: EventFormValues = {
      ...data,
      tickets: consolidateEventTicketsForPersist(data),
    }
    const liveSectorIds = collectLiveSeatingSectorIds({
      venueMap: next.venue.venueMap,
      seatingLayout: next.venue.seatingLayout,
      extraIds: assignableLogicalSectorIds(
        next.venue.zones,
        next.venue.venueMap,
      ),
    })
    next = sanitizeEventSubmitPayload(next, {
      mode: editingId ? "update" : "create",
      persistedIds: (initialData?.values.tickets ?? [])
        .map((tier) => tier.id)
        .filter((id): id is string => Boolean(id)),
      liveSectorIds,
    })
    return {
      ...next,
      tickets: applyMapCapacityToTickets(
        next.tickets,
        parseVenueMap(next.venue.venueMap),
      ),
    }
  }

  async function persistInventoryDraft(data: EventFormValues) {
    cancelPendingAutosave()
    await waitForInFlightAutosave()
    const eventId = initialData?.id ?? persistedEventId
    if (!eventId) {
      return {
        success: false as const,
        error: "No hay un evento para guardar el inventario.",
      }
    }
    const payloadData = buildConsolidatedPayload(data)
    console.info("[event-wizard] persist payload", payloadData)
    const formData = new FormData()
    formData.set("payload", JSON.stringify(payloadData))
    formData.set("draftMode", "1")
    formData.set("eventId", eventId)
    if (targetOrganizerId) {
      formData.set("targetOrganizerId", targetOrganizerId)
    }
    const result = await updateCompleteEvent(formData)
    if (result.success) markSaved(payloadData)
    return result
  }

  async function onSubmit(
    data: EventFormValues,
    intent: "draft" | "publish" = "draft",
  ): Promise<boolean> {
    cancelPendingAutosave()
    await waitForInFlightAutosave()
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
      toast.error(message, {
        description: "Usá un JPG o PNG de menos de 5 MB.",
        duration: 5000,
      })
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
        "No pudimos guardar los cambios. Revisá tu conexión a internet e intentá de nuevo",
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
    payloadData = buildConsolidatedPayload(payloadData)
    console.info("[event-wizard] persist payload", payloadData)
    form.setValue("tickets", payloadData.tickets, { shouldDirty: false })
    const liveSectorIds = collectLiveSeatingSectorIds({
      venueMap: payloadData.venue.venueMap,
      seatingLayout: payloadData.venue.seatingLayout,
      extraIds: assignableLogicalSectorIds(
        payloadData.venue.zones,
        payloadData.venue.venueMap,
      ),
    })

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
            ? "No pudimos guardar los cambios"
            : "No se pudo crear el evento"),
        result.wizardConflict,
        result.code,
        result.field,
        result.actionHint,
      )
      return false
    }

    // Persiste matriz Zona × Tier
    if (zoneTierPricing.length > 0) {
      const { syncZoneTierPricing } = await import("@/app/actions/event-autosave")
      const pricingResult = await syncZoneTierPricing({
        eventId: result.eventId,
        rows: zoneTierPricing.filter(
          (row) => !row.sectorKey || liveSectorIds.has(row.sectorKey),
        ),
      })
      if (!pricingResult.success) {
        reportPersistError(
          pricingResult.error,
          "El evento se guardó, pero falló la matriz de precios por zona",
        )
        return false
      }
    }

    if (result.eventId) {
      useEventFormStore.getState().setEventId(result.eventId)
    }
    markSaved(payloadData)

    if (intent === "publish") {
      clearDraft(draftKey)
      toast.success(
        isEditing ? "¡Listo! Cambios guardados correctamente" : "Borrador listo",
        {
          description: "Confirmá el envío a revisión de TokePass.",
        },
      )
      setPublishConfirm({ open: true, eventId: result.eventId })
      return true
    }

    toast.success("¡Listo! Cambios guardados correctamente", {
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
      const result = await persistInventoryDraft(form.getValues())
      if (!result.success) {
        toast.error("No se pudo guardar el mapa", {
          description: result.error,
        })
        return
      }
      setIsStudioOpen(false)
    } finally {
      setIsStudioClosing(false)
    }
  }

  function setEventModality(online: boolean) {
    form.setValue("basics.deliveryMode", online ? "ONLINE" : "PRESENCIAL", {
      shouldDirty: true,
    })
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
    description: step.description,
  }))
  const studioActive = Math.max(0, visibleStepIndexes.indexOf(resolvedStep))
  const eventDisplayName = watchedTitle || initialData?.title || "evento"
  const studioTitle = isEditing
    ? `Editá: ${eventDisplayName}`
    : watchedTitle
      ? `Creá: ${watchedTitle}`
      : "Creá tu evento"
  const studioSubtitle =
    "Completá los datos del evento. Los cambios se guardan automáticamente."

  return (
    <>
    <Form {...form}>
      <form
        className="flex min-h-full w-full flex-1 flex-col overflow-x-hidden"
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
          title={studioTitle}
          subtitle={studioSubtitle}
          stepper={
            <EventStudioStepper
              steps={studioSteps}
              activeIndex={studioActive}
              onSelect={(index) => void moveToStep(index)}
            />
          }
          status={<EventAutosaveIndicator onRetry={() => void flushAutosave()} />}
          capacity={<EventCapacityHeader form={form} />}
          banner={
            impersonationName ? (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-100"
              >
                <p className="text-sm font-semibold text-amber-200">
                  {workspace ? "Editando" : "Creando"} a nombre de{" "}
                  {impersonationName}
                </p>
              </div>
            ) : null
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
              <div className="flex flex-col gap-y-6">
              <div className="grid grid-cols-1 items-start gap-8 overflow-x-hidden py-2 lg:grid-cols-12">
                <div className="min-w-0 space-y-6 lg:col-span-7">
                  <FormField
                    control={form.control}
                    name="basics.title"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-2">
                        <FormLabel
                          htmlFor="event-title"
                          className={STUDIO_LABEL_CLASS}
                        >
                          Nombre de tu evento
                        </FormLabel>
                        <Input
                          {...field}
                          id="event-title"
                          data-field="basics.title"
                          aria-invalid={Boolean(fieldState.error)}
                          placeholder="Fiesta del gaucho, Recital en vivo"
                          className={STUDIO_CONTROL_CLASS}
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
                        <FormLabel className={STUDIO_LABEL_CLASS}>
                          Categoría
                        </FormLabel>
                        {categories.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No hay categorías activas.
                          </p>
                        ) : (
                          <Select
                            value={field.value || ""}
                            onValueChange={field.onChange}
                            items={categories.map((category) => ({
                              value: category.id,
                              label: category.name,
                            }))}
                          >
                            <SelectTrigger
                              data-field="basics.categoryId"
                              className={STUDIO_CONTROL_CLASS}
                            >
                              <SelectValue placeholder="Elegí una categoría" />
                            </SelectTrigger>
                            <SelectContent
                              alignItemWithTrigger={false}
                              className={STUDIO_SELECT_CONTENT_CLASS}
                            >
                              {categories.map((category) => {
                                const Icon = resolveCategoryIcon(
                                  category.iconName,
                                )
                                return (
                                  <SelectItem
                                    key={category.id}
                                    value={category.id}
                                  >
                                    <span className="inline-flex items-center gap-2">
                                      <Icon className="size-3.5 shrink-0" />
                                      {category.name}
                                    </span>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        )}
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          ¿Qué tipo de evento es?
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
                        <FormLabel className={STUDIO_LABEL_CLASS}>
                          Público permitido
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
                                    ? "border-primary/40 bg-primary/10 text-foreground"
                                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                                )}
                              >
                                {AGE_RESTRICTION_LABELS[value]}
                              </button>
                            )
                          })}
                        </div>
                        <FormDescription className="text-xs leading-relaxed text-muted-foreground">
                          Ej: para todo público (ATP) o solo mayores de 18. El
                          control de DNI es de la puerta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <p className={STUDIO_LABEL_CLASS}>
                      Modalidad
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEventModality(false)}
                        className={cn(
                          "rounded-2xl px-3 py-3 text-left transition",
                          !isStreaming
                            ? STUDIO_MODALITY_ACTIVE_CLASS
                            : STUDIO_MODALITY_IDLE_CLASS,
                        )}
                      >
                        <MapPin className="mb-2 size-4 text-emerald-400" />
                        <span className="block text-sm font-semibold">
                          En un lugar físico / Predio
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Recinto físico y puerta.
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEventModality(true)}
                        className={cn(
                          "rounded-2xl px-3 py-3 text-left transition",
                          isStreaming
                            ? STUDIO_MODALITY_ACTIVE_CLASS
                            : STUDIO_MODALITY_IDLE_CLASS,
                        )}
                      >
                        <MonitorPlay className="mb-2 size-4 text-emerald-400" />
                        <span className="block text-sm font-semibold">
                          Por internet / En vivo (Zoom, YouTube, etc.)
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Sin recinto físico.
                        </span>
                      </button>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="basics.isMultiDay"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                        <div>
                          <FormLabel className="mb-0 text-sm font-bold text-slate-800 dark:text-zinc-200">
                            ¿Es un evento de varios días?
                          </FormLabel>
                          <FormDescription className="text-xs text-muted-foreground">
                            Activalo si dura más de una fecha.
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
                          aria-label="Evento de varios días"
                        />
                      </FormItem>
                    )}
                  />

                  {isMultiDay ? (
                    <ScheduleDaysBuilder control={form.control} />
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="basics.date"
                        render={({ field, fieldState }) => (
                          <FormItem>
                            <FormLabel
                              htmlFor="event-date"
                              className={cn(STUDIO_LABEL_CLASS, "block")}
                            >
                              Apertura y comienzo
                            </FormLabel>
                            <EventStudioDateTimeField
                              id="event-date"
                              fieldName="basics.date"
                              value={field.value}
                              onChange={field.onChange}
                              invalid={Boolean(fieldState.error)}
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
                              className={cn(STUDIO_LABEL_CLASS, "block")}
                            >
                              Hora estimada de cierre
                            </FormLabel>
                            <EventStudioDateTimeField
                              id="event-end-date"
                              fieldName="basics.endDate"
                              value={field.value}
                              onChange={field.onChange}
                              invalid={Boolean(fieldState.error)}
                            />
                            <FormDescription className="text-xs text-muted-foreground">
                              Indicá hasta qué hora la gente va a poder comprar
                              entradas por la web
                            </FormDescription>
                            <FormMessage>{fieldState.error?.message}</FormMessage>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {isStreaming ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                        El evento se publica como {STREAMING_VENUE_NAME}. No hace
                        falta recinto ni mapa de asientos.
                      </div>
                      <FormField
                        control={form.control}
                        name="basics.accessLink"
                        render={({ field, fieldState }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className={STUDIO_LABEL_CLASS}>
                              Link de transmisión
                            </FormLabel>
                            <Input
                              {...field}
                              type="url"
                              inputMode="url"
                              data-field="basics.accessLink"
                              aria-invalid={Boolean(fieldState.error)}
                              placeholder="https://zoom.us/j/..."
                              className={STUDIO_CONTROL_CLASS}
                            />
                            <FormDescription className="text-xs text-muted-foreground">
                              Pegá acá el link de Zoom, YouTube o la sala donde
                              vas a transmitir el vivo
                            </FormDescription>
                            <FormMessage>{fieldState.error?.message}</FormMessage>
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className={STUDIO_LABEL_CLASS}>
                        Ubicación y recinto
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
                  )}

                  <FormField
                    control={form.control}
                    name="basics.description"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel
                          htmlFor="event-description"
                          className={cn(STUDIO_LABEL_CLASS, "block")}
                        >
                          Contá de qué se trata tu evento
                        </FormLabel>
                        <Textarea
                          {...field}
                          id="event-description"
                          data-field="basics.description"
                          placeholder="Contá de qué se trata, el clima y por qué ir."
                          className={cn(STUDIO_CONTROL_CLASS, "min-h-[160px] h-auto resize-y py-3")}
                        />
                        <FormDescription className="text-muted-foreground">
                          Aparece en la página principal.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="min-w-0 space-y-6 lg:col-span-5">
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
                  <EventSponsorsManager
                    eventId={initialData?.id ?? persistedEventId}
                  />
                </div>
              </div>
              </div>
            </TabsContent>

            <TabsContent
              keepMounted
              value="1"
              id="event-wizard-step-1"
              className="hidden"
            />


            <TabsContent
              keepMounted
              value="2"
              id="event-wizard-step-2"
              className={cn(
                "animate-in fade-in slide-in-from-right-2 duration-300",
                workspace && "h-full overflow-y-auto",
              )}
            >
              <div className="flex flex-col gap-y-8">
              <div className="flex flex-col gap-y-2">
                <h2 className="hidden text-xl font-bold text-foreground sm:block">
                  Entradas y precios
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  El mapa y las entradas generales suman al cupo por separado.
                  Una general puede quedar como inventario libre, sin sector.
                </p>
              </div>
              <div className="flex flex-col gap-y-4">
                {isStreaming ? (
                  <FormField
                    control={form.control}
                    name="basics.accessLink"
                    render={({ field, fieldState }) => (
                      <FormItem className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                        <FormLabel className={STUDIO_LABEL_CLASS}>
                          Link de la transmisión
                        </FormLabel>
                        <Input
                          {...field}
                          type="url"
                          inputMode="url"
                          data-field="basics.accessLink"
                          aria-invalid={Boolean(fieldState.error)}
                          placeholder="https://zoom.us/j/..."
                          className={STUDIO_CONTROL_CLASS}
                        />
                        <FormDescription className="text-xs text-muted-foreground">
                          Pegá acá el link de Zoom, YouTube o la sala donde vas
                          a transmitir el vivo
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />
                ) : null}
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
              </div>
              </div>
            </TabsContent>

            <TabsContent
              keepMounted
              value="3"
              id="event-wizard-step-3"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <div className="flex flex-col gap-y-8">
              <div className="flex flex-col gap-y-4">
                <h3 className="text-lg font-semibold text-foreground">
                  Publicar y cobrar
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-muted/20 p-6">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <CreditCard className="size-4 shrink-0 text-primary" />
                      Mercado Pago
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Pago online con tarjeta, débito y dinero en cuenta.
                      La comisión se incluye en el precio público.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/20 p-6">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Building2 className="size-4 shrink-0 text-primary" />
                      Transferencia / POS
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
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
                      <FormLabel className={cn(STUDIO_LABEL_CLASS, "block")}>
                        Visibilidad del evento
                      </FormLabel>
                      <div className="inline-flex w-full flex-col gap-1 rounded-2xl bg-muted/20 p-1.5 sm:w-auto sm:flex-row">
                        {(
                          [
                            {
                              value: "public" as const,
                              label: "Visible en TokePass",
                              hint: "Aparece en la portada cuando esté a la venta",
                              icon: Globe2,
                            },
                            {
                              value: "private" as const,
                              label: "Solo con el link",
                              hint: "No aparece en portada. Quien tenga el enlace puede entrar",
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
                                  ? "bg-background font-medium text-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              <Icon
                                className={cn(
                                  "size-4 shrink-0",
                                  selected
                                    ? "text-primary"
                                    : "text-muted-foreground",
                                )}
                                aria-hidden="true"
                              />
                              <span>
                                <span className="block font-medium">
                                  {option.label}
                                </span>
                                <span className="block text-xs leading-relaxed text-muted-foreground">
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

                <p className="text-xs leading-relaxed text-muted-foreground">
                  Recargar la comisión al comprador o hacértela cargo se
                  configura en cada entrada del paso 2.
                </p>

                <FormField
                  control={form.control}
                  name="basics.hasSchedule"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <div className="min-w-0">
                        <FormLabel className="mb-0 text-sm font-bold text-slate-800 dark:text-zinc-200">
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

                {!isStreaming ? (
                  <>
                    <FormField
                      control={form.control}
                      name="basics.hasSeatingPlan"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                              <Armchair className="size-4" aria-hidden="true" />
                            </span>
                            <div className="space-y-1">
                              <FormLabel className="mb-0 text-sm font-bold leading-snug text-slate-800 dark:text-zinc-200">
                                ¿Este evento tiene plano de asientos numerados?
                              </FormLabel>
                              <FormDescription className="text-xs text-muted-foreground">
                                Activá solo si hay butacas, mesas o tablones con número. Si no, el evento es admisión general.
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
                        className="h-12 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 md:text-sm"
                        onClick={() => setIsStudioOpen(true)}
                      >
                        Abrir Diseñador de Mapa de Recinto
                      </Button>
                    ) : null}
                  </>
                ) : null}

                {hasSchedule ? (
                  <AgendaBuilder eventId={initialData?.id ?? persistedEventId} />
                ) : null}

                {resultMessage?.type === "success" ? (
                  <p
                    role="status"
                    className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-foreground"
                  >
                    {resultMessage.text}
                  </p>
                ) : null}
              </div>
              </div>
            </TabsContent>

        </Tabs>
          {isStudioOpen ? (
            <TokepassStudioOverlay
              open={isStudioOpen}
              closing={isStudioClosing}
              onClose={() => void closeStudio()}
            >
              <InteractiveVenueMapEditor
                variant="studio"
                eventId={initialData?.id ?? persistedEventId}
                eventTitle={watchedTitle || initialData?.title || "Evento"}
                onEventTitleChange={(title) =>
                  form.setValue("basics.title", title, {
                    shouldDirty: true,
                  })
                }
                value={parseVenueMap(watchedVenueMap)}
                tickets={watchedTickets}
                saving={form.formState.isSubmitting || isStudioClosing}
                onClose={() => void closeStudio()}
                onChange={(next) => persistWorkspaceMap(next)}
                onSave={async (next) => {
                  persistWorkspaceMap(next)
                  const result = await persistInventoryDraft(form.getValues())
                  if (!result.success) {
                    throw new Error(result.error)
                  }
                }}
              />
            </TokepassStudioOverlay>
          ) : null}
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
