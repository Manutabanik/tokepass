"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  EyeOff,
  Gift,
  Globe2,
  IdCard,
  LoaderCircle,
  Lock,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Ticket,
  Trash2,
  UploadCloud,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form"
import { toast } from "sonner"

import {
  createCompleteEvent,
  updateCompleteEvent,
  type EditableEventData,
} from "@/app/actions/events"
import { PublishEventConfirmDialog } from "@/components/admin/publish-event-confirm-dialog"
import type { OrganizerVenue } from "@/app/actions/venues"
import { createVenue } from "@/app/actions/venues"
import { EventVenueStep } from "@/components/admin/event-venue-step"
import { ScheduleDaysBuilder } from "@/components/admin/schedule-days-builder"
import { VenueSeatPricingPanel } from "@/components/admin/venue-seat-pricing-panel"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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
import { formatCurrency } from "@/lib/format"
import { allInBreakdown } from "@/lib/pricing/all-in"
import {
  buildEmptyPricingMap,
  listPricableSectors,
  type VenuePricingMap,
} from "@/lib/seating/venue-adapter"
import {
  AGE_RESTRICTION_LABELS,
  AGE_RESTRICTION_VALUES,
  MAX_EVENT_FLYER_BYTES,
  eventFormSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"
import { getVenueSeatingItems } from "@/types/venues"

const steps = [
  {
    title: "Identidad",
    description: "Info, fechas, categoría y flyer",
    icon: Sparkles,
  },
  {
    title: "Lugar de la Fiesta",
    description: "Dónde y cuánta gente entra",
    icon: Building2,
  },
  {
    title: "Tipos de Entrada",
    description: "Precios y cupos",
    icon: Ticket,
  },
] as const

const fieldsByStep: FieldPath<EventFormValues>[][] = [
  [
    "basics.title",
    "basics.date",
    "basics.endDate",
    "basics.description",
    "basics.flyerName",
    "basics.visibility",
    "basics.categoryId",
    "basics.ageRestriction",
    "basics.isMultiDay",
    "basics.scheduleDays",
  ],
  [
    "venue.mode",
    "venue.existingVenueId",
    "venue.zoneType",
    "venue.venueName",
    "venue.venueLocation",
    "venue.capacity",
    "venue.rows",
    "venue.seatsPerRow",
  ],
  ["tickets"],
]

const blankTicket = (): EventFormValues["tickets"][number] =>
  ({
    name: "",
    price: undefined as unknown as number,
    capacity: undefined as unknown as number,
    timeLimit: "",
    bonusReward: "",
    dayId: null,
    visibility: "public",
    layoutType: "general",
    seatingSectorId: null,
    capacityPerUnit: 1,
    admitCount: 1,
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
    capacity: undefined,
    rows: undefined,
    seatsPerRow: undefined,
    latitude: null,
    longitude: null,
    seatingBackgroundUrl: null,
    saveVenueForReuse: true,
    zones: undefined,
  },
  tickets: [blankTicket()],
}

function NumberInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={value ?? ""}
      onChange={(event) => {
        const nextValue = event.target.value.replace(/[^\d.]/g, "")
        onChange(nextValue === "" ? undefined : Number(nextValue))
      }}
      className={cn("min-h-12 h-12 text-base", className)}
      {...props}
    />
  )
}

export function EventCreationWizard({
  organizerServiceRate,
  platformFixedFee = 0,
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
  const [highestStep, setHighestStep] = useState(0)
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
  const [venueCatalog, setVenueCatalog] = useState<OrganizerVenue[]>(venues)

  useEffect(() => {
    setVenueCatalog(venues)
  }, [venues])

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    mode: "onTouched",
    defaultValues: initialData?.values ?? defaultValues,
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tickets",
    keyName: "fieldKey",
  })

  const venueMode = useWatch({ control: form.control, name: "venue.mode" })
  const existingVenueId = useWatch({
    control: form.control,
    name: "venue.existingVenueId",
  })
  const flyerName = useWatch({ control: form.control, name: "basics.flyerName" })
  const isMultiDay = useWatch({
    control: form.control,
    name: "basics.isMultiDay",
  })
  const scheduleDays = useWatch({
    control: form.control,
    name: "basics.scheduleDays",
  })
  const watchedTickets = useWatch({
    control: form.control,
    name: "tickets",
  })
  const selectedVenue = venueCatalog.find((venue) => venue.id === existingVenueId)
  const numberedSectors =
    selectedVenue?.seatingLayout.filter(
      (sector) => sector.layout_type !== "general",
    ) ?? []
  const eventTitle = useWatch({ control: form.control, name: "basics.title" })

  useEffect(() => {
    if (!selectedVenue) {
      setVenuePricingMap({})
      return
    }
    setVenuePricingMap((current) => {
      const empty = buildEmptyPricingMap(selectedVenue)
      const next: VenuePricingMap = { ...empty }
      for (const key of Object.keys(empty)) {
        if (current[key] != null) next[key] = current[key]
      }
      const tickets = form.getValues("tickets")
      for (const tier of tickets) {
        const sectorKey =
          tier.seatingSectorId && next[tier.seatingSectorId] != null
            ? tier.seatingSectorId
            : Object.keys(empty).find((id) => {
                const sector = listPricableSectors(selectedVenue).find(
                  (item) => item.id === id,
                )
                return (
                  sector?.name.trim().toLocaleLowerCase("es") ===
                  tier.name.trim().toLocaleLowerCase("es")
                )
              })
        if (!sectorKey) continue
        const existing = next[sectorKey]
        const existingPrice =
          typeof existing === "number" ? existing : existing?.price
        if ((existingPrice ?? 0) === 0 && (tier.price ?? 0) > 0) {
          next[sectorKey] = tier.price
        }
      }
      return next
    })
  }, [form, selectedVenue])

  function syncTicketPricesFromVenue(pricing: VenuePricingMap) {
    const tickets = form.getValues("tickets")
    tickets.forEach((tier, index) => {
      if (!tier.seatingSectorId) return
      const entry = pricing[tier.seatingSectorId]
      if (entry == null) return
      const price = typeof entry === "number" ? entry : entry.price
      if (Number.isFinite(price) && price !== tier.price) {
        form.setValue(`tickets.${index}.price`, Math.max(0, price), {
          shouldDirty: true,
        })
      }
    })
  }

  function handleVenuePricingChange(next: VenuePricingMap) {
    setVenuePricingMap(next)
    syncTicketPricesFromVenue(next)
  }

  function handleApplySavedVenue(venue: OrganizerVenue) {
    const pricing = buildEmptyPricingMap(venue)
    const currentTickets = form.getValues("tickets")
    for (const tier of currentTickets) {
      if (tier.seatingSectorId && pricing[tier.seatingSectorId] == null) continue
      if (tier.seatingSectorId && Number.isFinite(tier.price)) {
        pricing[tier.seatingSectorId] = tier.price
      }
    }
    setVenuePricingMap(pricing)

    const pricable = listPricableSectors(venue)
    const isSingleBlank =
      currentTickets.length === 1 &&
      !currentTickets[0]?.name?.trim() &&
      (currentTickets[0]?.price == null ||
        !Number.isFinite(currentTickets[0]?.price)) &&
      (currentTickets[0]?.capacity == null ||
        !Number.isFinite(currentTickets[0]?.capacity)) &&
      !currentTickets[0]?.seatingSectorId &&
      !(currentTickets[0]?.sold && currentTickets[0].sold > 0)

    if (isSingleBlank && pricable.length > 0) {
      const hasSeatingLayout = venue.seatingLayout.length > 0
      form.setValue(
        "tickets",
        pricable.map((sector) => {
          const layoutSector = venue.seatingLayout.find((s) => s.id === sector.id)
          const layoutType = hasSeatingLayout
            ? (layoutSector?.layout_type ??
              (sector.type === "general" ? "general" : "numbered_seat"))
            : "general"
          const availableUnits = layoutSector
            ? getVenueSeatingItems(layoutSector).filter(
                (item) => item.status !== "blocked",
              ).length
            : venue.capacity
          return {
            name: sector.name,
            price: undefined as unknown as number,
            capacity:
              sector.type === "general" || !hasSeatingLayout
                ? Math.max(1, venue.capacity)
                : Math.max(1, availableUnits || venue.capacity),
            timeLimit: "",
            bonusReward: "",
            dayId: null,
            visibility: "public" as const,
            layoutType,
            seatingSectorId: layoutType === "general" ? null : sector.id,
            capacityPerUnit: layoutSector?.capacity_per_unit ?? 1,
            admitCount: 1,
          }
        }),
      )
    }
  }

  async function moveToStep(nextStep: number) {
    if (nextStep < activeStep) {
      setActiveStep(nextStep)
      return
    }

    if (nextStep > activeStep + 1) return

    const valid = await form.trigger(fieldsByStep[activeStep], {
      shouldFocus: true,
    })

    if (valid) {
      setActiveStep(nextStep)
      setHighestStep((current) => Math.max(current, nextStep))
    }
  }

  async function onSubmit(
    data: EventFormValues,
    intent: "draft" | "publish" = "draft",
  ) {
    setResultMessage(null)

    if (flyerFile && flyerFile.size > MAX_EVENT_FLYER_BYTES) {
      const message =
        "El flyer supera los 5MB. Comprimilo o elegí otra imagen."
      setFlyerError(message)
      form.setError("basics.flyerName", { type: "manual", message })
      setActiveStep(0)
      return
    }

    let payloadData = data
    if (
      data.venue.mode === "new" &&
      data.venue.saveVenueForReuse &&
      !data.venue.existingVenueId
    ) {
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
    if (flyerFile) {
      formData.set("flyer", flyerFile)
    }
    if (targetOrganizerId) {
      formData.set("targetOrganizerId", targetOrganizerId)
    }

    if (initialData) {
      formData.set("eventId", initialData.id)
    }

    const result = initialData
      ? await updateCompleteEvent(formData)
      : await createCompleteEvent(formData)

    if (!result.success) {
      setResultMessage({ type: "error", text: result.error })
      toast.error(
        isEditing
          ? "No se pudieron guardar los cambios"
          : "No se pudo crear el evento",
        {
          description: result.error,
        },
      )
      return
    }

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
          <TabsList className="grid w-full grid-cols-1 items-stretch gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-2 shadow-lg shadow-zinc-200/70 dark:shadow-black/20 backdrop-blur-md group-data-horizontal/tabs:h-auto sm:grid-cols-3">
            {steps.map(({ title, description }, index) => {
              const completed = index < activeStep
              const available = index <= highestStep + 1

              return (
                <TabsTrigger
                  key={title}
                  value={String(index)}
                  disabled={!available}
                  className="h-auto min-w-0 items-center justify-start gap-3 rounded-xl border border-transparent bg-transparent p-3.5 text-left text-zinc-700 dark:text-zinc-300 opacity-60 transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800/40 hover:opacity-100 data-active:border-emerald-500/40 data-active:bg-zinc-100 dark:data-active:bg-zinc-800/90 data-active:text-zinc-900 dark:data-active:text-white data-active:opacity-100 data-active:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 font-mono text-sm font-bold text-zinc-600 dark:text-zinc-400",
                      completed &&
                        "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
                      activeStep === index &&
                        "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400",
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
                    <span className="block truncate text-xs text-zinc-600 dark:text-zinc-400">
                      {description}
                    </span>
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <Card className="gap-0 rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 py-0 shadow-2xl shadow-zinc-200/80 ring-0 dark:border-zinc-800 dark:from-zinc-900/90 dark:to-zinc-950/95 dark:shadow-black/30 [&_[data-slot=input]]:rounded-xl [&_[data-slot=input]]:border-zinc-200 [&_[data-slot=input]]:bg-white [&_[data-slot=input]]:text-zinc-900 [&_[data-slot=input]]:shadow-inner [&_[data-slot=input]]:placeholder:text-zinc-400 [&_[data-slot=input]:focus-visible]:border-emerald-500/60 [&_[data-slot=input]:focus-visible]:bg-white [&_[data-slot=input]:focus-visible]:ring-2 [&_[data-slot=input]:focus-visible]:ring-emerald-500/15 dark:[&_[data-slot=input]]:border-zinc-800 dark:[&_[data-slot=input]]:bg-zinc-950 dark:[&_[data-slot=input]]:text-white dark:[&_[data-slot=input]]:placeholder:text-zinc-600 dark:[&_[data-slot=input]:focus-visible]:bg-zinc-900 [&_[data-slot=select-trigger]]:rounded-xl [&_[data-slot=select-trigger]]:border-zinc-200 [&_[data-slot=select-trigger]]:bg-zinc-50 [&_[data-slot=select-trigger]]:text-zinc-900 [&_[data-slot=select-trigger]]:shadow-inner [&_[data-slot=select-trigger]:focus-visible]:border-emerald-500/60 [&_[data-slot=select-trigger]:focus-visible]:ring-2 [&_[data-slot=select-trigger]:focus-visible]:ring-emerald-500/15 dark:[&_[data-slot=select-trigger]]:border-zinc-800 dark:[&_[data-slot=select-trigger]]:bg-zinc-950/80 dark:[&_[data-slot=select-trigger]]:text-white">
            <TabsContent
              value="0"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="px-6 pt-8 sm:px-10 sm:pt-10">
                <CardTitle className="mb-1 text-2xl font-bold text-zinc-900 dark:text-white">
                  Identidad del evento
                </CardTitle>
                <CardDescription className="border-b border-zinc-200 dark:border-zinc-800 pb-6 text-sm text-zinc-600 dark:text-zinc-400">
                  Nombre, fechas, categoría, edad y flyer. Lo esencial para
                  publicar.
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
                          className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                        >
                          Título
                        </FormLabel>
                        <Input
                          {...field}
                          id="event-title"
                          placeholder="Ej. Fiesta de Año Nuevo en el Complejo X"
                          className="h-12 w-full rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white shadow-inner transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
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
                        <FormLabel className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                          Categoría
                        </FormLabel>
                        <Select
                          value={field.value || undefined}
                          onValueChange={(value) => field.onChange(value ?? "")}
                        >
                          <SelectTrigger className="h-12 w-full rounded-xl">
                            <SelectValue placeholder="Elegí una categoría" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.length === 0 ? (
                              <SelectItem value="__empty" disabled>
                                No hay categorías activas
                              </SelectItem>
                            ) : (
                              categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                        <FormLabel className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
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
                        >
                          <SelectTrigger className="h-12 w-full rounded-xl">
                            <SelectValue placeholder="Elegí ATP, +16 o +18" />
                          </SelectTrigger>
                          <SelectContent>
                            {AGE_RESTRICTION_VALUES.map((value) => (
                              <SelectItem key={value} value={value}>
                                {AGE_RESTRICTION_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs text-zinc-500">
                          Se muestra en la ficha pública. El control de DNI es
                          responsabilidad de la puerta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.visibility"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
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
                                    ? "border border-zinc-300 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-white shadow-sm"
                                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 hover:text-zinc-900 dark:hover:text-white",
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "size-4 shrink-0",
                                    selected
                                      ? "text-emerald-400"
                                      : "text-zinc-500",
                                  )}
                                  aria-hidden="true"
                                />
                                <span>
                                  <span className="block font-medium">
                                    {option.label}
                                  </span>
                                  <span className="block text-[11px] text-zinc-500">
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

                  <FormField
                    control={form.control}
                    name="basics.isMultiDay"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-4 py-3">
                        <div>
                          <FormLabel className="text-sm font-medium text-zinc-900 dark:text-white">
                            ¿Varias jornadas / noches?
                          </FormLabel>
                          <FormDescription className="text-xs text-zinc-500">
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
                              className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                            >
                              Fecha y hora de inicio
                            </FormLabel>
                            <Input
                              {...field}
                              id="event-date"
                              type="datetime-local"
                              className="scheme-light dark:scheme-dark h-12 w-full rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white shadow-inner transition-all focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
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
                              className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                            >
                              Hora de finalización
                            </FormLabel>
                            <Input
                              {...field}
                              id="event-end-date"
                              type="datetime-local"
                              className="scheme-light dark:scheme-dark h-12 w-full rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white shadow-inner transition-all focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                            />
                            <FormDescription className="text-xs text-zinc-500">
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
                          className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                        >
                          Descripción
                        </FormLabel>
                        <Textarea
                          {...field}
                          id="event-description"
                          placeholder="Cuenta qué hace única a esta experiencia..."
                          className="min-h-[160px] w-full resize-y rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white shadow-inner transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                        />
                        <FormDescription className="text-zinc-500">
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
                    className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
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
                      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 shadow-sm transition-all group-hover:border-emerald-500/30 group-hover:bg-emerald-500/15 group-hover:text-emerald-400">
                        <UploadCloud className="size-5" aria-hidden="true" />
                      </span>
                      <span className="mb-1.5 block text-sm font-semibold text-zinc-900 dark:text-white transition-colors group-hover:text-emerald-300">
                        {flyerName ||
                          (isEditing
                            ? "Reemplazar flyer actual"
                            : "Subí el arte del evento")}
                      </span>
                      <span className="mx-auto block max-w-[240px] text-xs leading-relaxed text-zinc-500">
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
              </CardContent>
            </TabsContent>

            <TabsContent
              value="1"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 dark:border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-zinc-900 dark:text-white">
                  Lugar de la Fiesta
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Elegí un lugar guardado o creá uno nuevo acá mismo, con mapa y
                  zonas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7 px-6 py-7 lg:px-8">
                <EventVenueStep
                  form={form}
                  venues={venueCatalog}
                  onVenuesChange={setVenueCatalog}
                  onAppliedVenue={handleApplySavedVenue}
                  pricingSlot={
                    selectedVenue ? (
                      <VenueSeatPricingPanel
                        venue={selectedVenue}
                        pricingMap={venuePricingMap}
                        onPricingChange={handleVenuePricingChange}
                        eventTitle={eventTitle}
                      />
                    ) : null
                  }
                />
              </CardContent>
            </TabsContent>

            <TabsContent
              value="2"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-zinc-200 dark:border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-zinc-900 dark:text-white">
                  Tipos de Entrada
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Completá vos el nombre, el precio y la capacidad. No hay
                  valores por defecto: evitamos publicar gratis por accidente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-7 lg:px-8">
                {venueMode === "existing" && selectedVenue ? (
                  <VenueSeatPricingPanel
                    venue={selectedVenue}
                    pricingMap={venuePricingMap}
                    onPricingChange={handleVenuePricingChange}
                    eventTitle={eventTitle}
                  />
                ) : null}
                {fields.map((tier, index) => {
                  const tierLayoutType =
                    watchedTickets?.[index]?.layoutType ?? tier.layoutType
                  const compatibleSectors = numberedSectors.filter(
                    (sector) => sector.layout_type === tierLayoutType,
                  )

                  return (
                  <Card
                    key={tier.fieldKey}
                    className="border-0 bg-zinc-100 dark:bg-black/20 py-0 ring-1 ring-white/8"
                  >
                    <CardHeader className="flex-row items-center justify-between border-b border-zinc-200 dark:border-white/6 px-5 py-4">
                      <div>
                        <CardTitle className="text-sm text-zinc-900 dark:text-white">
                          Entrada {index + 1}
                        </CardTitle>
                        <CardDescription className="text-xs text-zinc-600">
                          {(tier.sold ?? 0) > 0
                            ? `${tier.sold} reservadas/vendidas · no se puede eliminar`
                            : "Nombre, precio y cupo"}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={fields.length === 1 || (tier.sold ?? 0) > 0}
                        onClick={() => remove(index)}
                        className="text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                        aria-label={`Eliminar entrada ${index + 1}`}
                      >
                        <Trash2 />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-5 px-5 py-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={form.control}
                          name={`tickets.${index}.name`}
                          render={({ field, fieldState }) => (
                            <FormItem>
                              <FormLabel htmlFor={`tier-${index}-name`}>
                                Nombre de la entrada
                              </FormLabel>
                              <Input
                                {...field}
                                id={`tier-${index}-name`}
                                placeholder="Ej. General, VIP, Preventa"
                                className="h-10 border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/20"
                              />
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`tickets.${index}.capacity`}
                          render={({ field, fieldState }) => (
                            <FormItem>
                              <FormLabel htmlFor={`tier-${index}-capacity`}>
                                Capacidad (Aforo máximo)
                              </FormLabel>
                              <NumberInput
                                id={`tier-${index}-capacity`}
                                min={1}
                                placeholder="Ej. 200"
                                value={field.value}
                                onChange={(value) => field.onChange(value)}
                                className="h-10 border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/20"
                              />
                              <p className="text-xs text-zinc-500">
                                Cantidad máxima de esta entrada. Limitá el cupo
                                si querés generar urgencia.
                              </p>
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )}
                        />
                      </div>

                      {form.watch(`tickets.${index}.layoutType`) ===
                      "general" ? (
                        <FormField
                          control={form.control}
                          name={`tickets.${index}.admitCount`}
                          render={({ field, fieldState }) => (
                            <FormItem>
                              <FormLabel htmlFor={`tier-${index}-admit`}>
                                Personas por unidad (QRs)
                              </FormLabel>
                              <NumberInput
                                id={`tier-${index}-admit`}
                                min={1}
                                max={50}
                                placeholder="1"
                                value={field.value}
                                onChange={(value) => field.onChange(value)}
                                className="h-10 border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-black/20"
                              />
                              <p className="text-xs text-zinc-500">
                                Ej: Mesa para 4 → 4. Genera QRs independientes
                                por cada compra.
                              </p>
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )}
                        />
                      ) : null}

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                        <div className="mb-4 flex items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                            <Armchair className="size-4" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                              Modalidad de acceso
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              Vinculá esta entrada con una zona numerada del
                              lugar.
                            </p>
                          </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <FormField
                            control={form.control}
                            name={`tickets.${index}.layoutType`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel
                                  htmlFor={`tier-${index}-layout-type`}
                                >
                                  Tipo de acceso
                                </FormLabel>
                                <Select
                                  value={field.value}
                                  onValueChange={(value) => {
                                    const layoutType =
                                      value === "table_combo" ||
                                      value === "numbered_seat"
                                        ? value
                                        : "general"
                                    field.onChange(layoutType)
                                    form.setValue(
                                      `tickets.${index}.seatingSectorId`,
                                      null,
                                    )
                                    form.setValue(
                                      `tickets.${index}.capacityPerUnit`,
                                      1,
                                    )
                                  }}
                                >
                                  <SelectTrigger
                                    id={`tier-${index}-layout-type`}
                                    className="h-10 w-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="general">
                                      Entrada general
                                    </SelectItem>
                                    <SelectItem
                                      value="table_combo"
                                      disabled={
                                        !numberedSectors.some(
                                          (sector) =>
                                            sector.layout_type ===
                                            "table_combo",
                                        )
                                      }
                                    >
                                      Mesa / combo cerrado
                                    </SelectItem>
                                    <SelectItem
                                      value="numbered_seat"
                                      disabled={
                                        !numberedSectors.some(
                                          (sector) =>
                                            sector.layout_type ===
                                            "numbered_seat",
                                        )
                                      }
                                    >
                                      Asiento numerado
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormDescription>
                                  {numberedSectors.length === 0
                                    ? "Este lugar no tiene zonas numeradas configuradas."
                                    : "La entrada general no necesita selección de asiento."}
                                </FormDescription>
                              </FormItem>
                            )}
                          />

                          {tierLayoutType !== "general" ? (
                            <FormField
                              control={form.control}
                              name={`tickets.${index}.seatingSectorId`}
                              render={({ field, fieldState }) => (
                                <FormItem>
                                  <FormLabel
                                    htmlFor={`tier-${index}-seating-sector`}
                                  >
                                    Zona del mapa
                                  </FormLabel>
                                  <Select
                                    value={field.value ?? ""}
                                    onValueChange={(value) => {
                                      field.onChange(value)
                                      const sector = compatibleSectors.find(
                                        (item) => item.id === value,
                                      )
                                      if (!sector) return
                                      form.setValue(
                                        `tickets.${index}.capacityPerUnit`,
                                        sector.capacity_per_unit,
                                      )
                                      form.setValue(
                                        `tickets.${index}.capacity`,
                                        getVenueSeatingItems(sector).filter(
                                          (item) =>
                                            item.status === "available",
                                        ).length,
                                      )
                                    }}
                                  >
                                    <SelectTrigger
                                      id={`tier-${index}-seating-sector`}
                                      className="h-10 w-full border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                                    >
                                      <SelectValue placeholder="Elegí una zona" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {compatibleSectors.map((sector) => (
                                        <SelectItem
                                          key={sector.id}
                                          value={sector.id}
                                        >
                                          {sector.sector_name} ·{" "}
                                          {
                                            getVenueSeatingItems(sector).filter(
                                              (item) =>
                                                item.status === "available",
                                            ).length
                                          }{" "}
                                          unidades
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormDescription>
                                    {compatibleSectors.find(
                                      (sector) => sector.id === field.value,
                                    )?.capacity_per_unit ?? 1}{" "}
                                    personas por QR maestro.
                                  </FormDescription>
                                  <FormMessage>
                                    {fieldState.error?.message}
                                  </FormMessage>
                                </FormItem>
                              )}
                            />
                          ) : null}
                        </div>
                      </div>

                      {isMultiDay ? (
                        <FormField
                          control={form.control}
                          name={`tickets.${index}.dayId`}
                          render={({ field, fieldState }) => (
                            <FormItem>
                              <FormLabel
                                htmlFor={`tier-${index}-day`}
                                className="flex items-center gap-1.5"
                              >
                                <CalendarDays
                                  className="size-3.5 text-emerald-400"
                                  aria-hidden="true"
                                />
                                ¿Para qué fecha es válida esta entrada?
                              </FormLabel>
                              <Select
                                value={field.value || "all"}
                                onValueChange={(value) =>
                                  field.onChange(
                                    value === "all" ? null : value,
                                  )
                                }
                              >
                                <SelectTrigger
                                  id={`tier-${index}-day`}
                                  className="h-10 w-full border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/20"
                                >
                                  <SelectValue placeholder="Elegí jornada" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">
                                    Abono completo (todas las noches)
                                  </SelectItem>
                                  {(scheduleDays ?? []).map((day) => (
                                    <SelectItem key={day.id} value={day.id}>
                                      {day.title || "Jornada sin nombre"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )}
                        />
                      ) : null}

                      <FormField
                        control={form.control}
                        name={`tickets.${index}.visibility`}
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <EyeOff
                                className="mt-0.5 size-4 shrink-0 text-zinc-500"
                                aria-hidden="true"
                              />
                              <div>
                                <FormLabel className="text-sm text-zinc-800 dark:text-zinc-200">
                                  Oculta al público
                                </FormLabel>
                                <FormDescription className="text-xs text-zinc-500">
                                  Solo promotores y RRPP / enlace exclusivo
                                </FormDescription>
                              </div>
                            </div>
                            <Switch
                              checked={field.value === "private"}
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked ? "private" : "public",
                                )
                              }
                              aria-label="Ocultar entrada al público"
                            />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`tickets.${index}.price`}
                        render={({ field, fieldState }) => {
                          const breakdown = allInBreakdown(
                            field.value ?? 0,
                            organizerServiceRate,
                            platformFixedFee,
                          )
                          return (
                            <FormItem>
                              <FormLabel
                                htmlFor={`tier-${index}-price`}
                                className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                              >
                                Precio que ve el comprador
                              </FormLabel>
                              <div className="relative">
                                <CircleDollarSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
                                <NumberInput
                                  id={`tier-${index}-price`}
                                  min={0}
                                  step="0.01"
                                  placeholder="Ej. 15000"
                                  value={field.value}
                                  onChange={(value) => field.onChange(value)}
                                  className="h-12 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 pl-9"
                                />
                              </div>
                              <div className="my-3 space-y-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-3.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                                <p>
                                  Precio que ve el comprador:{" "}
                                  <span className="text-zinc-800 dark:text-zinc-200">
                                    {formatCurrency(breakdown.publicPrice)}
                                  </span>
                                </p>
                                <p className="text-rose-300/80">
                                  Comisión Tokepass (
                                  {Math.round(organizerServiceRate * 100)}%
                                  {platformFixedFee > 0
                                    ? ` + ${formatCurrency(platformFixedFee)}`
                                    : ""}
                                  ): -{formatCurrency(breakdown.platformFee)}
                                </p>
                              </div>
                              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                                <span className="font-sans text-xs font-bold uppercase text-emerald-400">
                                  Te queda en mano
                                </span>
                                <span className="font-mono text-lg font-extrabold text-zinc-900 dark:text-white">
                                  {formatCurrency(breakdown.basePrice)}
                                </span>
                              </div>
                              <p className="text-xs leading-5 text-zinc-500">
                                Hacerme cargo de la comisión (El comprador paga
                                el precio exacto, la comisión se descuenta de tu
                                ganancia).
                              </p>
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )
                        }}
                      />

                      <Accordion>
                        <AccordionItem
                          value={`smart-yield-${tier.fieldKey}`}
                          className="border-0"
                        >
                          <AccordionTrigger className="rounded-xl bg-zinc-50 dark:bg-white/[0.025] px-4 text-zinc-700 dark:text-zinc-300 hover:no-underline">
                            <span className="flex items-center gap-2">
                              <Gift className="size-4 text-violet-400" />
                              Opciones avanzadas
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="grid gap-4 px-4 pt-4 md:grid-cols-2">
                            <FormField
                              control={form.control}
                              name={`tickets.${index}.timeLimit`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel htmlFor={`tier-${index}-time-limit`}>
                                    Límite de ingreso
                                  </FormLabel>
                                  <Select
                                    value={field.value || "none"}
                                    onValueChange={(value) =>
                                      field.onChange(
                                        value === "none" ? "" : value,
                                      )
                                    }
                                  >
                                    <SelectTrigger
                                      id={`tier-${index}-time-limit`}
                                      className="h-10 w-full border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/20"
                                    >
                                      <SelectValue placeholder="Sin límite" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">
                                        Sin límite
                                      </SelectItem>
                                      <SelectItem value="00:00">
                                        Hasta las 00:00
                                      </SelectItem>
                                      <SelectItem value="01:00">
                                        Hasta la 01:00
                                      </SelectItem>
                                      <SelectItem value="02:00">
                                        Hasta las 02:00
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormDescription>
                                    Incentiva el check-in temprano.
                                  </FormDescription>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`tickets.${index}.bonusReward`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel htmlFor={`tier-${index}-reward`}>
                                    Premio por llegar antes
                                  </FormLabel>
                                  <Input
                                    {...field}
                                    id={`tier-${index}-reward`}
                                    placeholder="Ej. 1 consumición"
                                    className="h-10 border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-black/20"
                                  />
                                </FormItem>
                              )}
                            />
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                  </Card>
                  )
                })}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append(blankTicket())}
                  className="h-11 w-full border-dashed border-zinc-300 dark:border-white/12 bg-transparent text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.03] hover:text-zinc-900 dark:hover:text-white"
                >
                  <Plus />
                  Agregar otro tipo de entrada
                </Button>

                <FormMessage>
                  {form.formState.errors.tickets?.root?.message}
                </FormMessage>

                {resultMessage && (
                  <p
                    role="status"
                    className={cn(
                      "rounded-xl px-4 py-3 text-sm",
                      resultMessage.type === "success"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-red-500/10 text-red-300",
                    )}
                  >
                    {resultMessage.text}
                  </p>
                )}
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
                onClick={() => setActiveStep((current) => current - 1)}
                className="min-h-12 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white"
              >
                <ArrowLeft />
                Anterior
              </Button>

              {activeStep < steps.length - 1 ? (
                <Button
                  key="next"
                  type="button"
                  onClick={() => void moveToStep(activeStep + 1)}
                  className="min-h-12 bg-violet-600 text-base text-white hover:bg-violet-500"
                >
                  Siguiente
                  <ArrowRight />
                </Button>
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
                    onClick={() =>
                      void form.handleSubmit((data) =>
                        onSubmit(data, "publish"),
                      )()
                    }
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
