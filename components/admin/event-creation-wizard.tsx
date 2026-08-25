"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CalendarClock,
  CreditCard,
  MapPin,
  MonitorPlay,
  Plus,
  Sparkles,
  Ticket,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldErrors,
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
import { EventStudioShell } from "@/components/admin/event-studio-shell"
import { EventStudioStepper } from "@/components/admin/event-studio-stepper"
import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import type { OrganizerVenue } from "@/app/actions/venues"
import { upsertVenue } from "@/app/actions/venues"
import { AgendaBuilder } from "@/components/admin/agenda-builder"
import { EventSponsorsManager } from "@/components/admin/event-sponsors-manager"
import { EventStudioPublishStep } from "@/components/admin/events/event-studio-publish-step"
import { EventVenueStep } from "@/components/admin/event-venue-step"
import {
  UnifiedInventoryPanel,
} from "@/components/admin/unified-inventory-panel"
import { createInventoryTicket } from "@/lib/inventory/create-inventory-ticket"
import { ScheduleDaysBuilder } from "@/components/admin/schedule-days-builder"
import { useEventFormAutosave } from "@/hooks/use-event-form-autosave"
import type { ZoneTierPriceDraft } from "@/lib/stores/event-form-store"
import { useEventFormStore } from "@/lib/stores/event-form-store"
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
import { clampServiceFeePercentage } from "@/lib/pricing/net-profit"
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
  venueMapHasInventory,
  venueMapToSeatingLayout,
} from "@/lib/seating/venue-map-geometry"
import {
  computeEventCapacityFromForm,
  eventCapacityOverflowMessage,
} from "@/lib/inventory/capacity-budget"
import {
  EMPTY_MAP_ENABLE_ERROR,
  eventHasActiveSeatingMap,
  venueMapHasConfiguredSectors,
} from "@/lib/inventory/map-enablement"
import { assignableLogicalSectorIds } from "@/lib/inventory/logical-sectors"
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
  type PersistErrorSource,
  PERSIST_ERROR_TITLES,
} from "@/lib/errors/persist-error"
import {
  conflictFromPersistError,
  type WizardConflict,
} from "@/lib/seating/venue-map-sku-consistency"
import { formHasInventoryOrVenue } from "@/lib/events/event-inventory-fingerprint"
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
    description: "Nombre, recinto, fechas y flyer",
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
    description: "Visibilidad, cobros y devoluciones",
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
    ageRestriction: "",
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
  acceptsMercadoPago: true,
  acceptsPosPayments: true,
  defaultFeeStrategy: "pass_to_customer",
  serviceFeePercentage: 8,
  refundPolicy: "organizer",
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
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(() => {
    const basics = initialData?.values.basics
    return (
      basics?.deliveryMode === "ONLINE" ||
      Boolean(basics?.ageRestriction) ||
      Boolean(basics?.categoryId)
    )
  })
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
  const organizerFeePercentage = feePercentageFromRate(organizerServiceRate)

  const form = useForm<EventFormValues>({
    resolver: zodResolver(draftEventSchema) as Resolver<EventFormValues>,
    mode: "onChange",
    reValidateMode: "onChange",
    shouldUnregister: false,
    defaultValues: {
      ...defaultValues,
      serviceFeePercentage: organizerFeePercentage,
      ...(initialData?.values ?? {}),
    },
  })
  const { replace: replaceTickets } = useFieldArray({
    control: form.control,
    name: "tickets",
    keyName: "_rowId",
  })

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
  const watchedServiceFeePercentage = useWatch({
    control: form.control,
    name: "serviceFeePercentage",
  })
  const eventServiceFeePercentage = clampServiceFeePercentage(
    watchedServiceFeePercentage ?? organizerFeePercentage,
  )
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
    initialValues: {
      ...defaultValues,
      serviceFeePercentage: organizerFeePercentage,
      ...(initialData?.values ?? {}),
    },
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
  if (resolvedStep !== WIZARD_STEP_TICKETS && isStudioOpen) {
    setIsStudioOpen(false)
  }

  useEffect(() => {
    if (!workspace) return
    const key = editWorkspaceStepKey(resolvedStep)
    router.replace(`${pathname}?step=${key}`, { scroll: false })
  }, [workspace, resolvedStep, pathname, router])

  function applyMapInventory(map: ReturnType<typeof parseVenueMap>) {
    const pricing = venueMapToPricingMap(map)
    setVenuePricingMap(pricing)
    useEventFormStore.getState().setVenuePricingMap(pricing)
    const current = form.getValues("tickets") ?? []
    const next = syncMapBackedTickets(current, map, {
      defaultDayId: defaultInventoryDayId(
        form.getValues("basics.scheduleDays"),
      ),
      dayIds: (form.getValues("basics.scheduleDays") ?? []).map((day) => day.id),
    })
    if (!mapBackedTicketsUnchanged(current, next)) {
      replaceTickets(next)
    }
  }

  function handleApplySavedVenue(venue: OrganizerVenue) {
    const map = seatingLayoutToVenueMap(
      venue.seatingLayout,
      parseVenueMap(venue.venueMap),
    )
    if (venueMapHasInventory(map)) {
      form.setValue("basics.hasSeatingPlan", true, { shouldDirty: true })
      form.setValue("venue.includesSeatingMap", true, { shouldDirty: true })
    }
    applyMapInventory(map)
  }

  function moveToStep(nextStep: number) {
    const target = clampWizardStep(nextStep, wizardFlags)
    if (target === activeStep || target === resolvedStep) return
    if (target < 0 || target >= WIZARD_STEP_COUNT) return
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

  function onFormValidationError(errors: FieldErrors<EventFormValues>) {
    console.error("ERRORES DE VALIDACIÓN DEL FORMULARIO:", errors)
    const fieldPath = firstFieldErrorPath(errors)
    const step = wizardStepFromPath(fieldPath ? fieldPath.split(".") : [])
    goToWizardStep(step)
    window.setTimeout(() => {
      focusInvalidFormField(fieldPath)
    }, 80)
    toast.error("Hay campos con errores. Revisa la consola para más detalles.")
  }

  function retryLastSave() {
    void form.handleSubmit((data) => onSubmit(data, "draft"), onFormValidationError)()
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
    source?: PersistErrorSource,
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
    toast.error(source ? PERSIST_ERROR_TITLES[source] : safeMessage, {
      duration: 5000,
      description: source
        ? safeMessage
        : actionHint?.trim() || mapped.actionHint || FIELD_REVIEW_HINT,
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

  function syncAfterSuccessfulSave(values: EventFormValues) {
    markSaved(values)
    router.refresh()
  }

  async function onSaveIdentity(data: EventFormValues) {
    cancelPendingAutosave()
    await waitForInFlightAutosave()
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
    if (!formHasInventoryOrVenue(data)) {
      formData.set("identityOnly", "1")
    }
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
        result.actionHint,
        result.source,
      )
      return
    }

    if (result.eventId) {
      useEventFormStore.getState().setEventId(result.eventId)
    }
    syncAfterSuccessfulSave(data)
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
      tickets: eventHasActiveSeatingMap({
        hasSeatingPlan: next.basics.hasSeatingPlan,
        includesSeatingMap: next.venue.includesSeatingMap,
        venueMap: next.venue.venueMap,
      })
        ? applyMapCapacityToTickets(
            next.tickets,
            parseVenueMap(next.venue.venueMap),
          )
        : next.tickets,
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
    const formData = new FormData()
    formData.set("payload", JSON.stringify(payloadData))
    formData.set("draftMode", "1")
    formData.set("eventId", eventId)
    if (targetOrganizerId) {
      formData.set("targetOrganizerId", targetOrganizerId)
    }
    const result = await updateCompleteEvent(formData)
    if (!result.success) {
      reportPersistError(
        result.error,
        result.title ?? "No pudimos guardar el inventario",
        result.wizardConflict,
        result.code,
        result.field,
        result.actionHint,
        result.source,
      )
      return result
    }
    syncAfterSuccessfulSave(payloadData)
    return result
  }

  async function onSubmit(
    data: EventFormValues,
    intent: "draft" | "publish" | "update" = "draft",
  ): Promise<boolean> {
    cancelPendingAutosave()
    await waitForInFlightAutosave()
    if (intent === "draft" && activeStep === 0 && !workspace) {
      await onSaveIdentity(data)
      return true
    }

    if (intent === "publish" || intent === "update") {
      const capacity = computeEventCapacityFromForm(data)
      if (capacity.exceeded) {
        const message = eventCapacityOverflowMessage(capacity)
        toast.error("El aforo está excedido", { description: message })
        goToWizardStep(WIZARD_STEP_TICKETS)
        return false
      }
    }

    if (intent === "publish") {
      const strict = publishEventSchema.safeParse(data)
      if (!strict.success) {
        console.error("ERRORES DE VALIDACIÓN DEL FORMULARIO:", strict.error.flatten())
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
      const capacitySnap = computeEventCapacityFromForm(data)
      const venueCapacity = Math.max(
        1,
        capacitySnap.baseVenueCapacity ||
          Math.floor(Number(data.venue.capacity)) ||
          1,
      )
      if (!Number.isFinite(venueCapacity) || venueCapacity < 1) {
        toast.error("Definí el aforo máximo del recinto.")
        goToWizardStep(WIZARD_STEP_IDENTITY)
        return false
      }
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
        capacity: venueCapacity,
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
    replaceTickets(payloadData.tickets)
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
    if (intent !== "publish") {
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
        result.source,
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
    syncAfterSuccessfulSave(payloadData)

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

    if (intent === "update") {
      toast.success("Cambios actualizados", {
        description: "El estado del evento no cambió. Los datos ya están guardados.",
      })
      return true
    }

    toast.success("¡Listo! Cambios guardados correctamente", {
      description: flyerFile
        ? "Borrador con flyer listo. Completá barra y multimedia cuando quieras."
        : "Podés seguir editando en esta pestaña.",
    })
    return true
  }

  function persistWorkspaceMap(
    next: ReturnType<typeof parseVenueMap>,
    options?: { announceEmpty?: boolean },
  ) {
    form.setValue("venue.venueMap", next, { shouldDirty: true })
    form.setValue("venue.seatingLayout", venueMapToSeatingLayout(next), {
      shouldDirty: true,
    })
    if (!venueMapHasConfiguredSectors(next)) {
      form.setValue("venue.includesSeatingMap", false, { shouldDirty: true })
      form.setValue("basics.hasSeatingPlan", false, { shouldDirty: true })
      form.setError("venue.venueMap", {
        type: "manual",
        message: EMPTY_MAP_ENABLE_ERROR,
      })
      if (options?.announceEmpty !== false) {
        toast.error(EMPTY_MAP_ENABLE_ERROR)
      }
      applyMapInventory(next)
      return
    }
    form.clearErrors("venue.venueMap")
    form.setValue("venue.includesSeatingMap", true, { shouldDirty: true })
    form.setValue("basics.hasSeatingPlan", true, { shouldDirty: true })
    applyMapInventory(next)
  }

  async function closeStudio() {
    if (isStudioClosing) return
    setIsStudioClosing(true)
    try {
      persistWorkspaceMap(parseVenueMap(form.getValues("venue.venueMap")), {
        announceEmpty: false,
      })
      setIsStudioOpen(false)
    } finally {
      setIsStudioClosing(false)
    }
    const eventId = initialData?.id ?? persistedEventId
    if (!eventId) return
    const result = await persistInventoryDraft(form.getValues())
    if (!result.success) {
      toast.error("El mapa quedó en el evento, pero no se pudo sincronizar", {
        description: toUserFacingError(result.error),
      })
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
          onFormValidationError,
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
              onSelect={(index) => moveToStep(index)}
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
              submitting={form.formState.isSubmitting}
              eventStatus={initialData?.status ?? null}
              onBack={() =>
                moveToStep(prevWizardStep(resolvedStep, wizardFlags))
              }
              onNext={() =>
                moveToStep(nextWizardStep(resolvedStep, wizardFlags))
              }
              onPublish={() => void onSubmit(form.getValues(), "publish")}
              onUpdate={() => void onSubmit(form.getValues(), "update")}
            />
          }
        >
        <Tabs
          value={String(resolvedStep)}
          onValueChange={(value) => {
            const next = Number(value)
            if (!Number.isFinite(next) || next === resolvedStep) return
            moveToStep(next)
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
                          required
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

                  {isStreaming ? (
                    <div className="space-y-2">
                      <p className={STUDIO_LABEL_CLASS}>Ubicación y recinto</p>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
                        El evento se publica como {STREAMING_VENUE_NAME}. No hace
                        falta recinto ni mapa de asientos.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className={STUDIO_LABEL_CLASS}>
                        Ubicación y recinto{" "}
                        <span className="text-red-500">*</span>
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
                              required
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
                              required
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

                  <FormField
                    control={form.control}
                    name="basics.hasSchedule"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                        <div>
                          <FormLabel className="mb-0 text-sm font-bold text-slate-800 dark:text-zinc-200">
                            Añadir cronograma de actividades (Opcional)
                          </FormLabel>
                          <FormDescription className="text-xs text-muted-foreground">
                            Charlas, shows o itinerario por horarios.
                          </FormDescription>
                        </div>
                        <Switch
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                          className="data-checked:bg-violet-500"
                          aria-label="Añadir cronograma de actividades"
                        />
                      </FormItem>
                    )}
                  />
                  {hasSchedule ? (
                    <AgendaBuilder
                      eventId={initialData?.id ?? persistedEventId}
                    />
                  ) : null}

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

                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedDetails((open) => !open)}
                      className={cn(
                        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-semibold transition",
                        "border-slate-300 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/60",
                        "dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-950/20",
                      )}
                      aria-expanded={showAdvancedDetails}
                    >
                      <Plus
                        className={cn(
                          "size-4 transition-transform",
                          showAdvancedDetails && "rotate-45",
                        )}
                        aria-hidden
                      />
                      {showAdvancedDetails
                        ? "Ocultar detalles avanzados"
                        : "Agregar detalles avanzados"}
                    </button>
                    {showAdvancedDetails ? (
                      <div className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
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
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )}
                        />

                        <div className="space-y-2">
                          <p className={STUDIO_LABEL_CLASS}>Modalidad</p>
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

                        {isStreaming ? (
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
                                  Pegá acá el link de Zoom, YouTube o la sala
                                  donde vas a transmitir el vivo
                                </FormDescription>
                                <FormMessage>
                                  {fieldState.error?.message}
                                </FormMessage>
                              </FormItem>
                            )}
                          />
                        ) : null}

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
                                Ej: para todo público (ATP) o solo mayores de
                                18. El control de DNI es de la puerta.
                              </FormDescription>
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )}
                        />

                        <div className="space-y-2">
                          <p className={STUDIO_LABEL_CLASS}>
                            Sponsors y marcas
                          </p>
                          <EventSponsorsManager
                            eventId={initialData?.id ?? persistedEventId}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
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
                  El termómetro compara el stock de generales y del mapa con el
                  aforo del recinto del paso anterior.
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
                <UnifiedInventoryPanel
                  form={form}
                  eventId={initialData?.id ?? persistedEventId}
                  feePercentage={eventServiceFeePercentage}
                  fixedFee={platformFixedFee}
                  hideMapBlock={isStreaming}
                  onOpenMapStudio={() => setIsStudioOpen(true)}
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
              <EventStudioPublishStep
                form={form}
                eventId={initialData?.id ?? persistedEventId}
              />
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
                onChange={(next) =>
                  persistWorkspaceMap(next, { announceEmpty: false })
                }
                onSave={async (next) => {
                  persistWorkspaceMap(next, { announceEmpty: false })
                  const eventId = initialData?.id ?? persistedEventId
                  if (!eventId) return
                  const result = await persistInventoryDraft(form.getValues())
                  if (!result.success) {
                    console.error(
                      "ERRORES AL GUARDAR EL MAPA:",
                      result.error,
                      result.wizardConflict,
                    )
                    throw new Error(toUserFacingError(result.error))
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
