"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
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
import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import type { OrganizerVenue } from "@/app/actions/venues"
import { createVenue } from "@/app/actions/venues"
import { EventSponsorsManager } from "@/components/admin/event-sponsors-manager"
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
  mapBackedTicketsUnchanged,
  migrateLegacyWizardStep,
  syncMapBackedTickets,
  venueMapToPricingMap,
} from "@/lib/seating/venue-map-pricing"
import { seatingLayoutToVenueMap } from "@/lib/seating/venue-map-geometry"
import { parseVenueMap } from "@/types/venue-map"
import {
  AGE_RESTRICTION_LABELS,
  AGE_RESTRICTION_VALUES,
  MAX_EVENT_FLYER_BYTES,
  draftEventSchema,
  publishEventSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

const steps = [
  {
    title: "Identidad",
    description: "Nombre, fechas y banner",
    icon: Sparkles,
  },
  {
    title: "Mapa y Sectores",
    description: "Lugar, inventario visual y precios",
    icon: MapPin,
  },
  {
    title: "Tickets y Combos",
    description: "Generales, extras y promociones",
    icon: Ticket,
  },
  {
    title: "Configuración Final",
    description: "Cobros, privacidad y publicar",
    icon: CreditCard,
  },
] as const

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
    rows: undefined,
    seatsPerRow: undefined,
    latitude: null,
    longitude: null,
    seatingBackgroundUrl: null,
    venueMap: null,
    seatingLayout: undefined,
    includesSeatingMap: false,
    saveVenueForReuse: true,
    zones: undefined,
  },
  tickets: [blankTicket()],
  ticketsDefaultTab: "auto",
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
    shouldUnregister: false,
    defaultValues: initialData?.values ?? defaultValues,
  })

  const flyerName = useWatch({ control: form.control, name: "basics.flyerName" })
  const isMultiDay = useWatch({
    control: form.control,
    name: "basics.isMultiDay",
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
  })

  const clearDraft = useEventFormStore((s) => s.clearDraft)
  const setWizardStep = useEventFormStore((s) => s.setWizardStep)

  useEffect(() => {
    const apply = () => {
      const persisted = migrateLegacyWizardStep(
        useEventFormStore.getState().wizardStep,
      )
      if (persisted >= 0 && persisted < steps.length) {
        setActiveStep(persisted)
        setWizardStep(persisted)
      }
    }
    apply()
    const persistApi = useEventFormStore.persist
    if (persistApi.hasHydrated()) return
    return persistApi.onFinishHydration(apply)
  }, [setWizardStep])

  function applyMapInventory(map: ReturnType<typeof parseVenueMap>) {
    const pricing = venueMapToPricingMap(map)
    setVenuePricingMap(pricing)
    useEventFormStore.getState().setVenuePricingMap(pricing)
    const current = form.getValues("tickets") ?? []
    const next = syncMapBackedTickets(current, map)
    if (!mapBackedTicketsUnchanged(current, next)) {
      form.setValue("tickets", next, { shouldDirty: true })
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
    if (nextStep < 0 || nextStep >= steps.length) return
    flushAutosave()
    setActiveStep(nextStep)
    setWizardStep(nextStep)
  }

  async function onSubmit(
    data: EventFormValues,
    intent: "draft" | "publish" = "draft",
  ) {
    setResultMessage(null)

    if (intent === "publish") {
      const strict = publishEventSchema.safeParse(data)
      if (!strict.success) {
        const message =
          strict.error.issues[0]?.message ??
          "Completá los datos obligatorios para publicar."
        toast.error("Todavía no se puede publicar", { description: message })
        setResultMessage({ type: "error", text: message })
        void form.trigger()
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
      !data.venue.existingVenueId &&
      data.venue.venueName.trim().length >= 2
    if (canPersistVenue) {
      const persist = await createVenue({
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
        toast.error(persist.error)
        setResultMessage({ type: "error", text: persist.error })
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

    const editingId = initialData?.id ?? persistedEventId
    const result = editingId
      ? await updateCompleteEvent(formData)
      : await createCompleteEvent(formData)

    if (!result.success) {
      setResultMessage({ type: "error", text: result.error })
      toast.error(
        isEditing || editingId
          ? "No se pudieron guardar los cambios"
          : "No se pudo crear el evento",
        {
          description: result.error,
        },
      )
      return
    }

    // Persiste matriz Zona × Tier
    if (zoneTierPricing.length > 0) {
      const { syncZoneTierPricing } = await import("@/app/actions/event-autosave")
      await syncZoneTierPricing({
        eventId: result.eventId,
        rows: zoneTierPricing,
      })
    }

    clearDraft(draftKey)

    if (intent === "publish") {
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

    toast.success(isEditing ? "Cambios guardados" : "Borrador guardado", {
      description: flyerFile
        ? "Borrador con flyer listo. Completá barra y multimedia cuando quieras."
        : "Podés potenciar el evento desde el panel.",
    })
    router.push(`/admin/events/${result.eventId}`)
    router.refresh()
  }

  return (
    <>
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => onSubmit(data, "draft"))}
      >
        <Tabs
          value={String(activeStep)}
          onValueChange={(value) => void moveToStep(Number(value))}
          className="flex flex-col gap-8"
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            <EventAutosaveIndicator />
          </div>
          <TabsList className="grid w-full grid-cols-1 items-stretch gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-2 shadow-lg shadow-zinc-200/70 dark:shadow-black/20 backdrop-blur-md group-data-horizontal/tabs:h-auto sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ title, description }, index) => {
              const completed = index < activeStep
              const available = true

              return (
                <TabsTrigger
                  key={title}
                  value={String(index)}
                  disabled={!available}
                  className="h-auto min-w-0 items-center justify-start gap-3 rounded-xl border border-transparent bg-transparent p-3.5 text-left text-foreground opacity-60 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800/40 hover:opacity-100 data-active:border-emerald-500/40 data-active:bg-zinc-100 dark:data-active:bg-zinc-800/90 data-active:text-zinc-900 dark:data-active:text-white data-active:opacity-100 data-active:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
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
                      index + 1
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

          <Card className="gap-0 rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 py-0 shadow-2xl shadow-zinc-200/80 ring-0 dark:border-zinc-800 dark:from-zinc-900/90 dark:to-zinc-950/95 dark:shadow-black/30 [&_[data-slot=input]]:rounded-xl [&_[data-slot=input]]:border-zinc-200 [&_[data-slot=input]]:bg-white [&_[data-slot=input]]:text-zinc-900 [&_[data-slot=input]]:shadow-inner [&_[data-slot=input]]:placeholder:text-slate-500 dark:placeholder:text-muted-foreground [&_[data-slot=input]:focus-visible]:border-emerald-500/60 [&_[data-slot=input]:focus-visible]:bg-white [&_[data-slot=input]:focus-visible]:ring-2 [&_[data-slot=input]:focus-visible]:ring-emerald-500/15 dark:[&_[data-slot=input]]:border-zinc-800 dark:[&_[data-slot=input]]:bg-zinc-950 dark:[&_[data-slot=input]]:text-white dark:[&_[data-slot=input]]:placeholder:text-zinc-600 dark:[&_[data-slot=input]:focus-visible]:bg-zinc-900 [&_[data-slot=select-trigger]]:rounded-xl [&_[data-slot=select-trigger]]:border-zinc-200 [&_[data-slot=select-trigger]]:bg-zinc-50 [&_[data-slot=select-trigger]]:text-zinc-900 [&_[data-slot=select-trigger]]:shadow-inner [&_[data-slot=select-trigger]:focus-visible]:border-emerald-500/60 [&_[data-slot=select-trigger]:focus-visible]:ring-2 [&_[data-slot=select-trigger]:focus-visible]:ring-emerald-500/15 dark:[&_[data-slot=select-trigger]]:border-zinc-800 dark:[&_[data-slot=select-trigger]]:bg-zinc-950/80 dark:[&_[data-slot=select-trigger]]:text-white">
            <TabsContent
              keepMounted
              value="0"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="px-6 pt-8 sm:px-10 sm:pt-10">
                <CardTitle className="mb-1 text-2xl font-bold text-foreground">
                  Identidad del evento
                </CardTitle>
                <CardDescription className="border-b border-zinc-200 dark:border-zinc-800 pb-6 text-sm text-muted-foreground">
                  Nombre, descripción, fechas y flyer. La categoría y la edad
                  también viven acá.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 items-start gap-8 px-6 py-8 sm:px-10 lg:grid-cols-12">
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
                                  <span className="block max-w-[200px] truncate sm:max-w-[300px]">
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
                                form.setValue("basics.scheduleDays", [
                                  {
                                    id: crypto.randomUUID(),
                                    title: "Día 1",
                                    startTime: form.getValues("basics.date") || "",
                                    endTime: "",
                                  },
                                  {
                                    id: crypto.randomUUID(),
                                    title: "Día 2",
                                    startTime: "",
                                    endTime: "",
                                  },
                                ])
                              }
                            } else {
                              form.setValue("basics.scheduleDays", [])
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
                            ? "Reemplazar flyer actual"
                            : "Subí el arte del evento")}
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
              value="1"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 dark:border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-foreground">
                  Mapa y sectores
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Ubicación del predio e inventario visual. Precio y capacidad
                  de cada zona se definen en el estudio, al trazar el polígono.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7 px-6 py-7 lg:px-8">
                <EventVenueStep
                  form={form}
                  venues={venueCatalog}
                  onVenuesChange={setLocalVenues}
                  onAppliedVenue={handleApplySavedVenue}
                  onMapInventoryChange={applyMapInventory}
                  focus="all"
                />
              </CardContent>
            </TabsContent>

            <TabsContent
              keepMounted
              value="2"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 dark:border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-foreground">
                  Tickets y combos
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Entradas generales, adicionales y combos. El aforo del
                  recinto limita el stock. Las preventas van como lotes de
                  una misma entrada, no como tipos duplicados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-7 lg:px-8">
                <UnifiedInventoryPanel form={form} />
                <FormMessage>
                  {form.formState.errors.tickets?.root?.message}
                </FormMessage>
              </CardContent>
            </TabsContent>

            <TabsContent
              keepMounted
              value="3"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 dark:border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-foreground">
                  Configuración final
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Medios de pago, privacidad del evento y publicación. El
                  autoguardado ya dejó el borrador en la nube.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 px-6 py-7 lg:px-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <CreditCard className="size-4 text-emerald-700 dark:text-emerald-400" />
                      Mercado Pago
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Checkout online con tarjeta, débito y dinero en cuenta.
                      La comisión All-In se calcula sobre el precio público.
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

                {resultMessage ? (
                  <p
                    role="status"
                    className={cn(
                      "rounded-xl px-4 py-3 text-sm",
                      resultMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                        : "bg-red-500/10 text-red-300",
                    )}
                  >
                    {resultMessage.text}
                  </p>
                ) : null}
              </CardContent>
            </TabsContent>

            <div
              className={cn(
                "sticky z-30 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-4 backdrop-blur-xl",
                "dark:border-white/8 dark:bg-[#0c0c0f]/95",
                "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-0 lg:static lg:border-t lg:bg-transparent lg:px-6 lg:py-5 lg:backdrop-blur-none lg:px-8",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                disabled={activeStep === 0 || form.formState.isSubmitting}
                onClick={() => void moveToStep(activeStep - 1)}
                className="min-h-12 text-muted-foreground hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-foreground"
              >
                <ArrowLeft />
                Anterior
              </Button>

              {activeStep < steps.length - 1 ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    key="draft-mid"
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    variant="outline"
                    className="min-h-12 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-base text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
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
                    onClick={() => void moveToStep(activeStep + 1)}
                    className="min-h-12 bg-violet-600 text-base text-white hover:bg-violet-500"
                  >
                    Siguiente
                    <ArrowRight />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    key="draft"
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    variant="outline"
                    className="min-h-12 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-base text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {form.formState.isSubmitting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    {form.formState.isSubmitting
                      ? "Guardando…"
                      : "Guardar"}
                  </Button>
                  <Button
                    key="publish"
                    type="button"
                    disabled={form.formState.isSubmitting}
                    className="min-h-12 bg-emerald-600 text-base text-white hover:bg-emerald-500"
                    onClick={() => void onSubmit(form.getValues(), "publish")}
                  >
                    {form.formState.isSubmitting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Rocket />
                    )}
                    {form.formState.isSubmitting
                      ? "Publicando…"
                      : "Publicar"}
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
