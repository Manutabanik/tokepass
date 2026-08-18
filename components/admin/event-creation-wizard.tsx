"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CreditCard,
  Globe2,
  IdCard,
  LoaderCircle,
  Lock,
  MapPin,
  Rocket,
  Save,
  Sparkles,
  Ticket,
  UploadCloud,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
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
  Card,
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
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { VenuePricingMap } from "@/lib/seating/venue-adapter"
import {
  applyMapCapacityToTickets,
  mapBackedTicketsUnchanged,
  syncMapBackedTickets,
  venueMapToPricingMap,
} from "@/lib/seating/venue-map-pricing"
import { seatingLayoutToVenueMap } from "@/lib/seating/venue-map-geometry"
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
import { cn } from "@/lib/utils"

const STEP_META = {
  [WIZARD_STEP_IDENTITY]: {
    title: "Identidad",
    description: "Nombre, fechas y banner",
    icon: Sparkles,
  },
  [WIZARD_STEP_AGENDA]: {
    title: "Cronograma / Artistas",
    description: "Horarios, charlas y lineup",
    icon: CalendarClock,
  },
  [WIZARD_STEP_MAP]: {
    title: "Mapa y Sectores",
    description: "Sectores generales y mapa enumerado",
    icon: MapPin,
  },
  [WIZARD_STEP_TICKETS]: {
    title: "Entradas y combos",
    description: "Generales, extras y promociones",
    icon: Ticket,
  },
  [WIZARD_STEP_CONFIG]: {
    title: "Configuración Final",
    description: "Cobros, privacidad y publicar",
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
}

export function EventCreationWizard({
  targetOrganizerId = null,
  venues = [],
  categories = [],
  initialData,
}: {
  organizerServiceRate: number
  platformFixedFee?: number
  targetOrganizerId?: string | null
  venues?: OrganizerVenue[]
  categories?: Array<{ id: string; name: string; slug: string; iconName: string | null }>
  initialData?: EditableEventData
}) {
  const router = useRouter()
  const isEditing = Boolean(initialData)
  const [activeStep, setActiveStep] = useState(0)
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [flyerError, setFlyerError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error"
    text: string
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
  const inventoryBlocked =
    activeStep === WIZARD_STEP_TICKETS &&
    (capacitySnapshot.exceeded || ticketsHavePhaseOverflow(watchedTickets ?? []))
  const flyerName = useWatch({ control: form.control, name: "basics.flyerName" })
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
  const wizardFlags: WizardVisibility = { hasSeatingPlan, hasSchedule }
  const visibleStepIndexes = visibleWizardSteps(wizardFlags)
  const visibleSteps = visibleStepIndexes.map((index) => ({
    index,
    ...STEP_META[index as keyof typeof STEP_META],
  }))

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
    apply()
    const persistApi = useEventFormStore.persist
    if (persistApi.hasHydrated()) return
    return persistApi.onFinishHydration(apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once; el toggle se clampea abajo
  }, [setWizardStep])

  const resolvedStep = clampWizardStep(activeStep, wizardFlags)
  if (resolvedStep !== activeStep) {
    setActiveStep(resolvedStep)
    setWizardStep(resolvedStep)
  }

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
    if (target === activeStep) return
    if (target < 0 || target >= WIZARD_STEP_COUNT) return
    if (activeStep === WIZARD_STEP_TICKETS && target !== WIZARD_STEP_TICKETS) {
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

  function goToWizardStep(step: number, sectorId?: string) {
    const resolved = clampWizardStep(step, {
      hasSeatingPlan,
      hasSchedule,
    })
    if (resolved < 0 || resolved >= WIZARD_STEP_COUNT) return
    setActiveStep(resolved)
    setWizardStep(resolved)
    window.setTimeout(() => {
      const panel = document.getElementById(`event-wizard-step-${resolved}`)
      panel?.scrollIntoView({ behavior: "smooth", block: "start" })
      if (!sectorId) return
      const target = document.querySelector(
        `[data-conflict-sector="${CSS.escape(sectorId)}"]`,
      )
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    }, 50)
  }

  useEffect(() => {
    function onGuided(event: Event) {
      const action = (event as CustomEvent<GuidedErrorAction>).detail
      if (action == null || typeof action.step !== "number") return
      const resolved = clampWizardStep(action.step, {
        hasSeatingPlan,
        hasSchedule,
      })
      if (resolved < 0 || resolved >= WIZARD_STEP_COUNT) return
      setActiveStep(resolved)
      setWizardStep(resolved)
    }
    window.addEventListener(GUIDED_ERROR_EVENT, onGuided)
    return () => window.removeEventListener(GUIDED_ERROR_EVENT, onGuided)
  }, [hasSeatingPlan, hasSchedule, setWizardStep])

  function showWizardConflict(conflict: WizardConflict, title: string) {
    setResultMessage({
      type: "error",
      text: conflict.summary,
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
                onClick={() => goToWizardStep(action.step, conflict.sectorId)}
              >
                {action.label}
              </button>
            ))}
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
  ) {
    const mapped = mapUnknownError(code ?? raw)
    const conflict =
      wizardConflict ??
      conflictFromPersistError(mapped.message) ??
      (mapped.action
        ? { summary: mapped.message, actions: [mapped.action] }
        : null)
    if (conflict) {
      showWizardConflict(conflict, title)
      return
    }
    setResultMessage({ type: "error", text: mapped.message })
    toast.error(title, { description: mapped.message })
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
        "No se pudo guardar la identidad",
        result.wizardConflict,
        result.code,
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
  ) {
    setResultMessage(null)

    if (intent === "draft" && activeStep === 0) {
      await onSaveIdentity(data)
      return
    }

    const capacity = computeEventCapacityFromForm(data)
    if (capacity.exceeded) {
      const message = eventCapacityOverflowMessage(capacity)
      form.setError("tickets", { type: "manual", message })
      toast.error("El aforo está excedido", { description: message })
      setResultMessage({ type: "error", text: message })
      goToWizardStep(2)
      return
    }

    if (intent === "publish") {
      const strict = publishEventSchema.safeParse(data)
      if (!strict.success) {
        const first = strict.error.issues[0]
        const message =
          first?.message ??
          "Completá los datos obligatorios para publicar."
        const mapped = mapUnknownError(message)
        toast.error("Todavía no se puede publicar", {
          description: mapped.message,
        })
        setResultMessage({ type: "error", text: mapped.message })
        void form.trigger()
        goToWizardStep(
          mapped.action?.step ?? wizardStepFromPath(first?.path ?? []),
        )
        return
      }
    }

    if (flyerFile && flyerFile.size > MAX_EVENT_FLYER_BYTES) {
      const message =
        "El flyer supera los 5MB. Comprimilo o elegí otra imagen."
      setFlyerError(message)
      form.setError("basics.flyerName", { type: "manual", message })
      setActiveStep(0)
      return
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
        reportPersistError(persist.error, "No se pudo guardar el lugar")
        return
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
        isEditing || editingId
          ? "No se pudieron guardar los cambios"
          : "No se pudo crear el evento",
        result.wizardConflict,
        result.code,
      )
      return
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
          description:
            "Confirmá la publicación y si querés purgar las entradas de prueba.",
        },
      )
      setPublishConfirm({ open: true, eventId: result.eventId })
      return
    }

    toast.success("Cambios guardados", {
      description: flyerFile
        ? "Borrador con flyer listo. Completá barra y multimedia cuando quieras."
        : "Podés seguir editando en esta pestaña.",
    })
  }

  return (
    <>
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(
          (data) => onSubmit(data, "draft"),
          () => {
            if (activeStep === 0) {
              toast.error("Revisá el nombre, las fechas o el flyer.")
              setActiveStep(0)
              return
            }
            const capacity = computeEventCapacityFromForm(form.getValues())
            if (capacity.exceeded) {
              const message = eventCapacityOverflowMessage(capacity)
              toast.error("El aforo está excedido", { description: message })
              goToWizardStep(WIZARD_STEP_TICKETS)
            }
          },
        )}
      >
        <Tabs
          value={String(activeStep)}
          onValueChange={(value) => void moveToStep(Number(value))}
          className="flex flex-col gap-8"
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            <EventCapacityHeader form={form} />
            <EventAutosaveIndicator />
          </div>
          <TabsList
            className={cn(
              "flex w-full items-stretch gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg shadow-zinc-200/70 backdrop-blur-md group-data-horizontal/tabs:h-auto max-sm:snap-x max-sm:snap-mandatory dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/20 sm:grid sm:grid-cols-2 sm:overflow-visible",
              visibleSteps.length >= 5
                ? "lg:grid-cols-5"
                : visibleSteps.length === 4
                  ? "lg:grid-cols-4"
                  : "lg:grid-cols-3",
            )}
          >
            {visibleSteps.map(({ index, title, description }, visibleIndex) => {
              const activePos = visibleStepIndexes.indexOf(activeStep)
              const completed = visibleIndex < activePos
              const available = true

              return (
                <TabsTrigger
                  key={title}
                  value={String(index)}
                  disabled={!available}
                  className="h-auto min-w-[15.5rem] shrink-0 snap-start items-center justify-start gap-3 rounded-xl border border-transparent bg-transparent p-3 text-left text-foreground opacity-60 transition-all hover:bg-zinc-100 hover:opacity-100 data-active:border-emerald-500/40 data-active:bg-zinc-100 data-active:text-zinc-900 data-active:opacity-100 data-active:shadow-[0_0_20px_rgba(16,185,129,0.15)] dark:hover:bg-zinc-800/40 dark:data-active:bg-zinc-800/90 dark:data-active:text-white sm:min-w-0"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 font-mono text-sm font-bold text-muted-foreground",
                      completed &&
                        "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                      activeStep === index &&
                        "border border-emerald-500/30 bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {completed ? (
                      <Check className="size-4" />
                    ) : (
                      visibleIndex + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <Card className="gap-0 rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 pt-0 pb-32 shadow-2xl shadow-zinc-200/80 ring-0 max-sm:overflow-x-hidden dark:border-zinc-800 dark:from-zinc-900/90 dark:to-zinc-950/95 dark:shadow-black/30 lg:pb-0 [&_[data-slot=input]]:rounded-xl [&_[data-slot=input]]:border-zinc-200 [&_[data-slot=input]]:bg-white [&_[data-slot=input]]:text-zinc-900 [&_[data-slot=input]]:shadow-inner [&_[data-slot=input]]:placeholder:text-slate-500 dark:placeholder:text-muted-foreground [&_[data-slot=input]:focus-visible]:border-emerald-500/60 [&_[data-slot=input]:focus-visible]:bg-white [&_[data-slot=input]:focus-visible]:ring-2 [&_[data-slot=input]:focus-visible]:ring-emerald-500/15 dark:[&_[data-slot=input]]:border-zinc-800 dark:[&_[data-slot=input]]:bg-zinc-950 dark:[&_[data-slot=input]]:text-white dark:[&_[data-slot=input]]:placeholder:text-zinc-600 dark:[&_[data-slot=input]:focus-visible]:bg-zinc-900 [&_[data-slot=select-trigger]]:rounded-xl [&_[data-slot=select-trigger]]:border-zinc-200 [&_[data-slot=select-trigger]]:bg-zinc-50 [&_[data-slot=select-trigger]]:text-zinc-900 [&_[data-slot=select-trigger]]:shadow-inner [&_[data-slot=select-trigger]:focus-visible]:border-emerald-500/60 [&_[data-slot=select-trigger]:focus-visible]:ring-2 [&_[data-slot=select-trigger]:focus-visible]:ring-emerald-500/15 dark:[&_[data-slot=select-trigger]]:border-zinc-800 dark:[&_[data-slot=select-trigger]]:bg-zinc-950/80 dark:[&_[data-slot=select-trigger]]:text-white">
            <TabsContent
              keepMounted
              value="0"
              id="event-wizard-step-0"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="px-4 pt-6 sm:px-10 sm:pt-10">
                <CardTitle className="mb-1 text-2xl font-bold text-foreground">
                  Identidad del evento
                </CardTitle>
                <CardDescription className="border-b border-zinc-200 dark:border-zinc-800 pb-6 text-sm text-muted-foreground">
                  Nombre, descripción, fechas y flyer. La categoría y la edad
                  también viven acá.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 items-start gap-6 px-4 py-6 sm:gap-8 sm:px-10 sm:py-8 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-7">
                  <FormField
                    control={form.control}
                    name="basics.title"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel
                          htmlFor="event-title"
                          className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground"
                        >
                          Título
                        </FormLabel>
                        <Input
                          {...field}
                          id="event-title"
                          placeholder="Ej. Fiesta de Año Nuevo en el Complejo X"
                          className="h-12 w-full rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-foreground shadow-inner transition-all placeholder:text-slate-500 dark:placeholder:text-muted-foreground dark:placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                        />
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.categoryId"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                          Categoría
                        </FormLabel>
                        <Select
                          value={field.value || undefined}
                          onValueChange={(value) => field.onChange(value ?? "")}
                          items={[
                            ...(categories.length === 0
                              ? [
                                  {
                                    value: "__empty",
                                    label: "No hay categorías activas",
                                  },
                                ]
                              : categories.map((category) => ({
                                  value: category.id,
                                  label: category.name,
                                }))),
                          ]}
                        >
                          <SelectTrigger className="h-12 w-full max-w-full overflow-hidden rounded-xl">
                            <SelectValue placeholder="Elegí una categoría">
                              {categories.find((c) => c.id === field.value)
                                ?.name ?? null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {categories.length === 0 ? (
                              <SelectItem value="__empty" disabled>
                                No hay categorías activas
                              </SelectItem>
                            ) : (
                              categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  <span className="block min-w-0 max-w-full truncate">
                                    {category.name}
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Lista definida por Tokepass. No se pueden crear etiquetas libres.
                        </p>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.ageRestriction"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                          <IdCard className="size-3.5" aria-hidden="true" />
                          Restricción de edad
                        </FormLabel>
                        <Select
                          value={field.value || undefined}
                          onValueChange={(value) =>
                            field.onChange(
                              value as EventFormValues["basics"]["ageRestriction"],
                            )
                          }
                          items={AGE_RESTRICTION_VALUES.map((value) => ({
                            value,
                            label: AGE_RESTRICTION_LABELS[value],
                          }))}
                        >
                          <SelectTrigger className="h-12 w-full max-w-full overflow-hidden rounded-xl">
                            <SelectValue placeholder="Elegí ATP, +16 o +18">
                              {field.value
                                ? AGE_RESTRICTION_LABELS[field.value]
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {AGE_RESTRICTION_VALUES.map((value) => (
                              <SelectItem key={value} value={value}>
                                {AGE_RESTRICTION_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs text-muted-foreground">
                          Se muestra en la ficha pública. El control de DNI es
                          responsabilidad de la puerta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.isMultiDay"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-4 py-3">
                        <div>
                          <FormLabel className="text-sm font-medium text-foreground">
                            ¿Varias jornadas / noches?
                          </FormLabel>
                          <FormDescription className="text-xs text-muted-foreground">
                            Activá esto para festivales de múltiples fechas.
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
                          aria-label="Activar evento multijornada"
                        />
                      </FormItem>
                    )}
                  />

                  {isMultiDay ? (
                    <ScheduleDaysBuilder control={form.control} />
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="basics.date"
                        render={({ field, fieldState }) => (
                          <FormItem>
                            <FormLabel
                              htmlFor="event-date"
                              className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground"
                            >
                              Fecha y hora de inicio
                            </FormLabel>
                            <Input
                              {...field}
                              id="event-date"
                              type="datetime-local"
                              className="scheme-light dark:scheme-dark h-12 w-full rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-foreground shadow-inner transition-all focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
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
                              Hora de finalización
                            </FormLabel>
                            <Input
                              {...field}
                              id="event-end-date"
                              type="datetime-local"
                              className="scheme-light dark:scheme-dark h-12 w-full rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-foreground shadow-inner transition-all focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                            />
                            <FormDescription className="text-xs text-muted-foreground">
                              Debe ser posterior al inicio (útil si cruza medianoche).
                            </FormDescription>
                            <FormMessage>{fieldState.error?.message}</FormMessage>
                          </FormItem>
                        )}
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
                          className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground"
                        >
                          Descripción
                        </FormLabel>
                        <Textarea
                          {...field}
                          id="event-description"
                          placeholder="Cuenta qué hace única a esta experiencia..."
                          className="min-h-[160px] w-full resize-y rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-foreground shadow-inner transition-all placeholder:text-slate-500 dark:placeholder:text-muted-foreground dark:placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                        />
                        <FormDescription className="text-muted-foreground">
                          Este texto será visible en la página de venta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.hasSeatingPlan"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent px-4 py-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            <MapPin className="size-4" aria-hidden="true" />
                          </span>
                          <div className="space-y-1">
                            <FormLabel className="text-sm font-semibold leading-snug text-foreground">
                              ¿Tu evento tiene mapa de ubicaciones o butacas
                              numeradas?
                            </FormLabel>
                            <FormDescription className="text-xs text-muted-foreground">
                              Si lo activás, aparece el paso Mapa y Sectores.
                            </FormDescription>
                          </div>
                        </div>
                        <Switch
                          checked={Boolean(field.value)}
                          onCheckedChange={(checked) => {
                            field.onChange(checked)
                            if (!checked) {
                              form.setValue("venue.includesSeatingMap", false, {
                                shouldDirty: true,
                              })
                              const currentTickets =
                                form.getValues("tickets") ?? []
                              if (
                                currentTickets.some((tier) => tier.seatingSectorId)
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
                          aria-label="¿Tu evento tiene mapa de ubicaciones o butacas numeradas?"
                        />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.hasSchedule"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between gap-4 rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-500/10 via-violet-500/5 to-transparent px-4 py-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/15 text-violet-700 dark:text-violet-300">
                            <CalendarClock className="size-4" aria-hidden="true" />
                          </span>
                          <div className="space-y-1">
                            <FormLabel className="text-sm font-semibold leading-snug text-foreground">
                              ¿Habilitar cronograma / agenda del evento?
                            </FormLabel>
                            <FormDescription className="text-xs text-muted-foreground">
                              Activa esto si tu evento tiene charlas, shows o un
                              itinerario por horarios.
                            </FormDescription>
                          </div>
                        </div>
                        <Switch
                          checked={Boolean(field.value)}
                          onCheckedChange={(checked) => {
                            field.onChange(checked)
                          }}
                          className="data-checked:bg-violet-500"
                          aria-label="¿Habilitar cronograma / agenda del evento?"
                        />
                      </FormItem>
                    )}
                  />
                </div>

                <FormItem className="flex flex-col gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/50 p-6 lg:col-span-5 lg:self-stretch">
                  <FormLabel
                    htmlFor="event-flyer"
                    className="block font-mono text-xs font-semibold uppercase tracking-wider text-foreground"
                  >
                    Flyer principal
                  </FormLabel>
                  <label
                    htmlFor="event-flyer"
                    className="group relative flex min-h-[280px] flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-8 text-center transition-all hover:border-emerald-500/50 hover:bg-white dark:hover:bg-zinc-900/80"
                  >
                    {initialData?.flyerUrl && !flyerFile ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- flyer host may vary; avoid next/image remotePatterns 500 */}
                        <img
                          src={initialData.flyerUrl}
                          alt={`Flyer actual de ${initialData.title}`}
                          className="absolute inset-0 size-full object-cover opacity-35 transition-opacity group-hover:opacity-20"
                        />
                        <span className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 via-zinc-900/30 to-transparent dark:from-zinc-950 dark:via-zinc-950/40 dark:to-transparent" />
                      </>
                    ) : null}
                    <span className="relative z-10">
                      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/80 text-foreground shadow-sm transition-all group-hover:border-emerald-500/30 group-hover:bg-emerald-500/15 group-hover:text-emerald-700 dark:text-emerald-400">
                        <UploadCloud className="size-5" aria-hidden="true" />
                      </span>
                      <span className="mb-1.5 block text-sm font-semibold text-zinc-900 transition-colors group-hover:text-emerald-800 dark:text-white dark:group-hover:text-emerald-300">
                        {flyerName ||
                          (isEditing
                            ? "Reemplazar imagen actual"
                            : "Subir imagen del evento")}
                      </span>
                      <span className="mx-auto block max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                        Tamaño máximo 5MB. Recomendamos formato horizontal
                        1600x900px (PNG, JPG o WEBP).
                      </span>
                    </span>
                    <Input
                      id="event-flyer"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        if (file && file.size > MAX_EVENT_FLYER_BYTES) {
                          setFlyerFile(null)
                          setFlyerError(
                            "El flyer supera los 5MB. Comprimilo o elegí otra imagen.",
                          )
                          form.setValue("basics.flyerName", null, {
                            shouldDirty: true,
                          })
                          form.setError("basics.flyerName", {
                            type: "manual",
                            message:
                              "El flyer supera los 5MB. Comprimilo o elegí otra imagen.",
                          })
                          event.target.value = ""
                          return
                        }
                        setFlyerError(null)
                        form.clearErrors("basics.flyerName")
                        setFlyerFile(file)
                        form.setValue(
                          "basics.flyerName",
                          file?.name ?? null,
                          { shouldDirty: true },
                        )
                      }}
                    />
                  </label>
                  {(flyerError ||
                    form.formState.errors.basics?.flyerName?.message) && (
                    <p className="text-sm text-red-400" role="alert">
                      {flyerError ??
                        form.formState.errors.basics?.flyerName?.message}
                    </p>
                  )}
                </FormItem>
                <div className="lg:col-span-12">
                  <EventSponsorsManager
                    eventId={initialData?.id ?? persistedEventId}
                  />
                </div>
              </CardContent>
            </TabsContent>

            <TabsContent
              keepMounted
              value={String(WIZARD_STEP_AGENDA)}
              id={`event-wizard-step-${WIZARD_STEP_AGENDA}`}
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 px-4 py-6 dark:border-white/8 lg:px-8">
                <CardTitle className="text-xl text-foreground">
                  Cronograma / Artistas
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Armá el itinerario por horarios. Un bloque puede ser solo un
                  título, o incluir una persona o talento de forma opcional.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7 px-4 py-7 lg:px-8">
                <AgendaBuilder eventId={initialData?.id ?? persistedEventId} />
              </CardContent>
            </TabsContent>

            <TabsContent
              keepMounted
              value="1"
              id="event-wizard-step-1"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 px-4 py-6 dark:border-white/8 lg:px-8">
                <CardTitle className="text-xl text-foreground">
                  Mapa y sectores
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Sectores generales por cupo (pista, VIP de pie) y, si hace
                  falta, el mapa visual de mesas y butacas. La capacidad total
                  se calcula sola.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7 px-4 py-7 lg:px-8">
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
                  focus="all"
                />
              </CardContent>
            </TabsContent>

            <TabsContent
              keepMounted
              value="2"
              id="event-wizard-step-2"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 px-4 py-6 dark:border-white/8 lg:px-8">
                <CardTitle className="text-xl text-foreground">
                  Entradas y combos
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  El mapa y las entradas generales suman al aforo por separado.
                  Una general puede quedar como inventario libre, sin sector.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 py-7 lg:px-8">
                <UnifiedInventoryPanel
                  form={form}
                  eventId={initialData?.id ?? persistedEventId}
                />
                <FormMessage>
                  {form.formState.errors.tickets?.message ??
                    form.formState.errors.tickets?.root?.message}
                </FormMessage>
              </CardContent>
            </TabsContent>

            <TabsContent
              keepMounted
              value="3"
              id="event-wizard-step-3"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 px-4 py-6 dark:border-white/8 lg:px-8">
                <CardTitle className="text-xl text-foreground">
                  Configuración final
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Medios de pago, privacidad del evento y publicación. El
                  autoguardado ya dejó el borrador en la nube.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-4 py-7 lg:px-8">
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
                              hint: "Visible en portada Tokepass",
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
            </TabsContent>

            {resultMessage?.type === "error" ? (
              <div className="px-4 pb-2 lg:px-8">
                {resultMessage.conflict ? (
                  <WizardConflictBanner
                    conflict={resultMessage.conflict}
                    onGoToStep={goToWizardStep}
                  />
                ) : (
                  <p
                    role="alert"
                    className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200"
                  >
                    {toUserFacingError(resultMessage.text)}
                  </p>
                )}
              </div>
            ) : null}

            <div
              className={cn(
                "fixed inset-x-0 bottom-0 z-50 flex w-full flex-col gap-2 border-t border-zinc-200 bg-white/95 px-4 pt-3 backdrop-blur-xl",
                "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                "dark:border-white/8 dark:bg-[#0c0c0f]/95",
                "lg:static lg:z-auto lg:flex-row lg:items-center lg:justify-between lg:bg-transparent lg:px-6 lg:py-5 lg:pb-5 lg:backdrop-blur-none",
              )}
            >
              <div className="flex items-center justify-between gap-2 lg:justify-start">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={
                    activeStep === WIZARD_STEP_IDENTITY ||
                    form.formState.isSubmitting
                  }
                  onClick={() =>
                    void moveToStep(prevWizardStep(activeStep, wizardFlags))
                  }
                  className="min-h-11 min-w-11 text-muted-foreground hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5"
                >
                  <ArrowLeft />
                  Anterior
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || inventoryBlocked}
                  variant="ghost"
                  className="min-h-11 min-w-11 text-muted-foreground hover:bg-zinc-100 hover:text-foreground dark:hover:bg-white/5 lg:hidden"
                >
                  {form.formState.isSubmitting ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  Guardar
                </Button>
              </div>

              {!isLastVisibleWizardStep(activeStep, wizardFlags) ? (
                <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
                  <Button
                    key="draft-mid"
                    type="submit"
                    disabled={form.formState.isSubmitting || inventoryBlocked}
                    variant="outline"
                    className="hidden min-h-11 border-zinc-300 bg-zinc-100 text-base text-zinc-900 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 lg:inline-flex"
                  >
                    {form.formState.isSubmitting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    Guardar
                  </Button>
                  <Button
                    key="next"
                    type="button"
                    disabled={inventoryBlocked}
                    onClick={() =>
                      void moveToStep(nextWizardStep(activeStep, wizardFlags))
                    }
                    className="min-h-11 w-full bg-violet-600 text-base text-white hover:bg-violet-500 lg:w-auto"
                  >
                    Siguiente
                    <ArrowRight />
                  </Button>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
                  <Button
                    key="draft"
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    variant="outline"
                    className="hidden min-h-11 border-zinc-300 bg-zinc-100 text-base text-zinc-900 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 lg:inline-flex"
                  >
                    {form.formState.isSubmitting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    {form.formState.isSubmitting ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button
                    key="publish"
                    type="button"
                    disabled={form.formState.isSubmitting}
                    className="min-h-11 w-full bg-emerald-600 text-base text-white hover:bg-emerald-500 lg:w-auto"
                    onClick={() => void onSubmit(form.getValues(), "publish")}
                  >
                    {form.formState.isSubmitting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Rocket />
                    )}
                    {form.formState.isSubmitting ? "Publicando…" : "Publicar"}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </Tabs>
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
