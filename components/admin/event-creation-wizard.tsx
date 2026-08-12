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
import Image from "next/image"
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
import { BoostModal } from "@/components/admin/boost-modal"
import { ScheduleDaysBuilder } from "@/components/admin/schedule-days-builder"
import {
  SavedVenuePickerDialog,
  VenueSeatPricingPanel,
} from "@/components/admin/venue-seat-pricing-panel"
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
  eventFormSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"
import { getVenueSeatingItems } from "@/types/venues"

const steps = [
  {
    title: "Esencia",
    description: "Identidad del evento",
    icon: Sparkles,
  },
  {
    title: "Arquitectura",
    description: "Recinto y capacidad",
    icon: Building2,
  },
  {
    title: "Economía",
    description: "Tickets y beneficios",
    icon: Ticket,
  },
  {
    title: "Crecimiento",
    description: "RRPP y upselling",
    icon: Rocket,
  },
] as const

const fieldsByStep: FieldPath<EventFormValues>[][] = [
  [
    "basics.title",
    "basics.date",
    "basics.description",
    "basics.flyerName",
    "basics.visibility",
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
  [
    "growth.isRRPPEnabled",
    "growth.commissionPercentage",
    "growth.isAddonsEnabled",
  ],
]

const defaultValues: EventFormValues = {
  basics: {
    title: "",
    date: "",
    description: "",
    flyerName: null,
    visibility: "public",
    isMultiDay: false,
    scheduleDays: [],
  },
  venue: {
    mode: "new",
    existingVenueId: null,
    zoneType: "general_admission",
    venueName: "",
    venueLocation: "",
    venueCity: "",
    capacity: 500,
    rows: 20,
    seatsPerRow: 20,
    zones: undefined,
  },
  tickets: [
    {
      name: "General",
      price: 0,
      capacity: 500,
      timeLimit: "",
      bonusReward: "",
      dayId: null,
      visibility: "public",
      layoutType: "general",
      seatingSectorId: null,
      capacityPerUnit: 1,
    },
  ],
  growth: {
    isRRPPEnabled: false,
    commissionPercentage: undefined,
    isAddonsEnabled: false,
  },
}

function NumberInput({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <Input
      type="number"
      value={value ?? ""}
      onChange={(event) => {
        const nextValue = event.target.value
        onChange(nextValue === "" ? undefined : Number(nextValue))
      }}
      {...props}
    />
  )
}

export function EventCreationWizard({
  organizerServiceRate,
  platformFixedFee = 0,
  targetOrganizerId = null,
  venues = [],
  initialData,
}: {
  organizerServiceRate: number
  platformFixedFee?: number
  targetOrganizerId?: string | null
  venues?: OrganizerVenue[]
  initialData?: EditableEventData
}) {
  const router = useRouter()
  const isEditing = Boolean(initialData)
  const [activeStep, setActiveStep] = useState(0)
  const [highestStep, setHighestStep] = useState(0)
  const [flyerFile, setFlyerFile] = useState<File | null>(null)
  const [boostEvent, setBoostEvent] = useState<{
    id: string
    title: string
  } | null>(null)
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)
  const [publishConfirm, setPublishConfirm] = useState<{
    open: boolean
    eventId: string
  }>({ open: false, eventId: "" })
  const [venuePickerOpen, setVenuePickerOpen] = useState(false)
  const [venuePricingMap, setVenuePricingMap] = useState<VenuePricingMap>({})

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

  const zoneType = useWatch({ control: form.control, name: "venue.zoneType" })
  const venueMode = useWatch({ control: form.control, name: "venue.mode" })
  const existingVenueId = useWatch({
    control: form.control,
    name: "venue.existingVenueId",
  })
  const isRRPPEnabled = useWatch({
    control: form.control,
    name: "growth.isRRPPEnabled",
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
  const venueRows = useWatch({ control: form.control, name: "venue.rows" })
  const venueSeatsPerRow = useWatch({
    control: form.control,
    name: "venue.seatsPerRow",
  })
  const selectedVenue = venues.find((venue) => venue.id === existingVenueId)
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

  function applyVenueBlueprint(venue: OrganizerVenue) {
    const firstZone = venue.zoneBlueprint[0]
    form.setValue("venue.mode", "existing")
    form.setValue("venue.existingVenueId", venue.id)
    form.setValue("venue.venueName", venue.name)
    form.setValue("venue.venueLocation", venue.location)
    form.setValue("venue.venueCity", venue.city ?? "")
    form.setValue("venue.capacity", venue.capacity)
    if (firstZone) {
      form.setValue("venue.zoneType", firstZone.type)
      if (firstZone.type === "general_admission") {
        form.setValue("venue.capacity", firstZone.capacity)
        form.setValue("venue.rows", undefined)
        form.setValue("venue.seatsPerRow", undefined)
      } else {
        form.setValue("venue.rows", firstZone.rows ?? undefined)
        form.setValue("venue.seatsPerRow", firstZone.seatsPerRow ?? undefined)
        form.setValue(
          "venue.capacity",
          (firstZone.rows ?? 0) * (firstZone.seatsPerRow ?? 0) ||
            firstZone.capacity,
        )
      }
    }
    form.setValue(
      "venue.zones",
      venue.zoneBlueprint.map((zone) => ({
        name: zone.name,
        type: zone.type,
        capacity: zone.capacity,
        rows: zone.rows ?? null,
        seatsPerRow: zone.seatsPerRow ?? null,
      })),
    )

    const pricing = buildEmptyPricingMap(venue)
    const currentTickets = form.getValues("tickets")
    for (const tier of currentTickets) {
      if (tier.seatingSectorId && pricing[tier.seatingSectorId] == null) continue
      if (tier.seatingSectorId && Number.isFinite(tier.price)) {
        pricing[tier.seatingSectorId] = tier.price
      }
    }
    setVenuePricingMap(pricing)

    // Si hay un solo tier genérico vacío, sugerir un tier por sector del recinto.
    const pricable = listPricableSectors(venue)
    const isSingleBlank =
      currentTickets.length === 1 &&
      (!currentTickets[0]?.name ||
        currentTickets[0]?.name === "General") &&
      (currentTickets[0]?.price ?? 0) === 0 &&
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
            price: 0,
            capacity:
              sector.type === "general" || !hasSeatingLayout
                ? Math.max(1, venue.capacity)
                : Math.max(1, availableUnits || venue.capacity),
            timeLimit: "",
            bonusReward: "",
            dayId: null,
            visibility: "public" as const,
            layoutType,
            seatingSectorId:
              layoutType === "general" ? null : sector.id,
            capacityPerUnit: layoutSector?.capacity_per_unit ?? 1,
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

    const formData = new FormData()
    formData.set("payload", JSON.stringify(data))
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

    if (isEditing) {
      toast.success("Cambios guardados", {
        description: "El evento y sus entradas se actualizaron correctamente.",
      })
      router.push("/admin/events")
      router.refresh()
      return
    }

    toast.success("Borrador guardado", {
      description: flyerFile
        ? "Borrador con flyer listo para previsualizar."
        : "Podés previsualizarlo o publicarlo cuando quieras.",
    })
    setBoostEvent({ id: result.eventId, title: data.basics.title })
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
          <TabsList className="grid w-full grid-cols-2 items-stretch gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-2 shadow-lg shadow-black/20 backdrop-blur-md group-data-horizontal/tabs:h-auto lg:grid-cols-4">
            {steps.map(({ title, description }, index) => {
              const completed = index < activeStep
              const available = index <= highestStep + 1

              return (
                <TabsTrigger
                  key={title}
                  value={String(index)}
                  disabled={!available}
                  className="h-auto min-w-0 items-center justify-start gap-3 rounded-xl border border-transparent bg-transparent p-3.5 text-left text-zinc-300 opacity-60 transition-all hover:bg-zinc-800/40 hover:opacity-100 data-active:border-emerald-500/40 data-active:bg-zinc-800/90 data-active:text-white data-active:opacity-100 data-active:shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 font-mono text-sm font-bold text-zinc-400",
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
                    <span className="block truncate text-xs text-zinc-400">
                      {description}
                    </span>
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <Card className="gap-0 rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 py-0 shadow-2xl shadow-black/30 ring-0 [&_[data-slot=input]]:rounded-xl [&_[data-slot=input]]:border-zinc-800 [&_[data-slot=input]]:bg-zinc-950 [&_[data-slot=input]]:text-white [&_[data-slot=input]]:shadow-inner [&_[data-slot=input]]:placeholder:text-zinc-600 [&_[data-slot=input]:focus-visible]:border-emerald-500/60 [&_[data-slot=input]:focus-visible]:bg-zinc-900 [&_[data-slot=input]:focus-visible]:ring-2 [&_[data-slot=input]:focus-visible]:ring-emerald-500/15 [&_[data-slot=select-trigger]]:rounded-xl [&_[data-slot=select-trigger]]:border-zinc-800 [&_[data-slot=select-trigger]]:bg-zinc-950/80 [&_[data-slot=select-trigger]]:text-white [&_[data-slot=select-trigger]]:shadow-inner [&_[data-slot=select-trigger]:focus-visible]:border-emerald-500/60 [&_[data-slot=select-trigger]:focus-visible]:ring-2 [&_[data-slot=select-trigger]:focus-visible]:ring-emerald-500/15">
            <TabsContent
              value="0"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="px-6 pt-8 sm:px-10 sm:pt-10">
                <CardTitle className="mb-1 text-2xl font-bold text-white">
                  Esencia del Evento
                </CardTitle>
                <CardDescription className="border-b border-zinc-800 pb-6 text-sm text-zinc-400">
                  Define cómo se presenta y cuándo ocurre la experiencia.
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
                          className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300"
                        >
                          Título
                        </FormLabel>
                        <Input
                          {...field}
                          id="event-title"
                          placeholder="Ej. Neon City Festival"
                          className="h-12 w-full rounded-xl border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white shadow-inner transition-all placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                        />
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.visibility"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300">
                          Visibilidad del evento
                        </FormLabel>
                        <div className="inline-flex w-full flex-col gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1.5 sm:w-auto sm:flex-row">
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
                                    ? "border border-zinc-700/60 bg-zinc-800 font-medium text-white shadow-sm"
                                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-white",
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
                      <FormItem className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                        <div>
                          <FormLabel className="text-sm font-medium text-white">
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
                    <FormField
                      control={form.control}
                      name="basics.date"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel
                            htmlFor="event-date"
                            className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300"
                          >
                            Fecha y hora
                          </FormLabel>
                          <Input
                            {...field}
                            id="event-date"
                            type="datetime-local"
                            className="scheme-dark h-12 w-full rounded-xl border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white shadow-inner transition-all focus:border-emerald-500/60 focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                          />
                          <FormMessage>{fieldState.error?.message}</FormMessage>
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="basics.description"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel
                          htmlFor="event-description"
                          className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300"
                        >
                          Descripción
                        </FormLabel>
                        <Textarea
                          {...field}
                          id="event-description"
                          placeholder="Cuenta qué hace única a esta experiencia..."
                          className="min-h-[160px] w-full resize-y rounded-xl border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white shadow-inner transition-all placeholder:text-zinc-600 focus:border-emerald-500/60 focus:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/15 focus:outline-none"
                        />
                        <FormDescription className="text-zinc-500">
                          Este texto será visible en la página de venta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />
                </div>

                <FormItem className="flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-6 lg:col-span-5 lg:self-stretch">
                  <FormLabel
                    htmlFor="event-flyer"
                    className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Flyer principal
                  </FormLabel>
                  <label
                    htmlFor="event-flyer"
                    className="group relative flex min-h-[280px] flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center transition-all hover:border-emerald-500/50 hover:bg-zinc-900/80"
                  >
                    {initialData?.flyerUrl && !flyerFile ? (
                      <>
                        <Image
                          src={initialData.flyerUrl}
                          alt={`Flyer actual de ${initialData.title}`}
                          fill
                          sizes="(min-width: 1024px) 380px, 100vw"
                          className="object-cover opacity-35 transition-opacity group-hover:opacity-20"
                        />
                        <span className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                      </>
                    ) : null}
                    <span className="relative z-10">
                      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-800/80 text-zinc-300 shadow-sm transition-all group-hover:border-emerald-500/30 group-hover:bg-emerald-500/15 group-hover:text-emerald-400">
                        <UploadCloud className="size-5" aria-hidden="true" />
                      </span>
                      <span className="mb-1.5 block text-sm font-semibold text-white transition-colors group-hover:text-emerald-300">
                        {flyerName ||
                          (isEditing
                            ? "Reemplazar flyer actual"
                            : "Sube el arte del evento")}
                      </span>
                      <span className="mx-auto block max-w-[220px] text-xs leading-relaxed text-zinc-500">
                        PNG, JPG o WEBP. Recomendado 1600 × 900 px.
                      </span>
                    </span>
                    <Input
                      id="event-flyer"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null
                        setFlyerFile(file)
                        form.setValue(
                          "basics.flyerName",
                          file?.name ?? null,
                          { shouldDirty: true },
                        )
                      }}
                    />
                  </label>
                </FormItem>
              </CardContent>
            </TabsContent>

            <TabsContent
              value="1"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-white">
                  Arquitectura Física
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Modela el espacio para controlar aforo y asignación.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-7 px-6 py-7 lg:px-8">
                <FormField
                  control={form.control}
                  name="venue.zoneType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Qué tipo de espacio es?</FormLabel>
                      <div className="grid gap-3 md:grid-cols-2">
                        {[
                          {
                            value: "general_admission" as const,
                            title: "Espacio General / Boliche",
                            description:
                              "Control por aforo, sin ubicación individual.",
                            icon: Building2,
                          },
                          {
                            value: "reserved_seating" as const,
                            title: "Asientos Numerados / Teatro",
                            description:
                              "Cada comprador selecciona una ubicación.",
                            icon: Armchair,
                          },
                        ].map((option) => {
                          const selected = field.value === option.value
                          const Icon = option.icon

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => field.onChange(option.value)}
                              className={cn(
                                "flex gap-4 rounded-2xl border p-5 text-left transition duration-200",
                                selected
                                  ? "border-violet-500/40 bg-violet-500/10 ring-1 ring-inset ring-violet-500/15"
                                  : "border-white/8 bg-black/15 hover:border-white/15 hover:bg-white/[0.03]",
                              )}
                            >
                              <span
                                className={cn(
                                  "grid size-11 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-500",
                                  selected &&
                                    "bg-violet-500/15 text-violet-300",
                                )}
                              >
                                <Icon className="size-5" />
                              </span>
                              <span>
                                <span className="block font-semibold text-zinc-200">
                                  {option.title}
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                                  {option.description}
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
                  name="venue.mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recinto</FormLabel>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => {
                            field.onChange("new")
                            form.setValue("venue.existingVenueId", null)
                            form.setValue("venue.zones", undefined)
                            setVenuePricingMap({})
                          }}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left text-sm transition",
                            field.value === "new"
                              ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
                              : "border-white/8 bg-black/15 text-zinc-400",
                          )}
                        >
                          Crear recinto nuevo
                        </button>
                        <button
                          type="button"
                          disabled={venues.length === 0}
                          onClick={() => {
                            field.onChange("existing")
                            setVenuePickerOpen(true)
                          }}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left text-sm transition disabled:opacity-40",
                            field.value === "existing"
                              ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
                              : "border-white/8 bg-black/15 text-zinc-400",
                          )}
                        >
                          Usar recinto guardado
                          {venues.length === 0
                            ? " (todavía no hay)"
                            : ` (${venues.length})`}
                        </button>
                      </div>
                    </FormItem>
                  )}
                />

                <SavedVenuePickerDialog
                  open={venuePickerOpen}
                  onOpenChange={setVenuePickerOpen}
                  venues={venues}
                  selectedVenueId={existingVenueId ?? null}
                  onSelect={applyVenueBlueprint}
                />

                {venueMode === "existing" ? (
                  <FormField
                    control={form.control}
                    name="venue.existingVenueId"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel htmlFor="existing-venue">
                          Seleccionar recinto
                        </FormLabel>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Select
                            value={field.value ?? ""}
                            onValueChange={(value) => {
                              const venue = venues.find(
                                (item) => item.id === value,
                              )
                              if (venue) applyVenueBlueprint(venue)
                            }}
                          >
                            <SelectTrigger
                              id="existing-venue"
                              className="h-11 flex-1 border-white/10 bg-black/20"
                            >
                              <SelectValue placeholder="Elegí un recinto" />
                            </SelectTrigger>
                            <SelectContent>
                              {venues.map((venue) => (
                                <SelectItem key={venue.id} value={venue.id}>
                                  {venue.name}
                                  {venue.city ? ` · ${venue.city}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 border-white/10"
                            onClick={() => setVenuePickerOpen(true)}
                          >
                            Ver lista
                          </Button>
                        </div>
                        <FormDescription>
                          Importa dirección, ciudad, plano y sectores al evento.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />
                ) : null}

                {venueMode === "existing" && selectedVenue ? (
                  <VenueSeatPricingPanel
                    venue={selectedVenue}
                    pricingMap={venuePricingMap}
                    onPricingChange={handleVenuePricingChange}
                    eventTitle={eventTitle}
                  />
                ) : null}

                <FormField
                  control={form.control}
                  name="venue.venueName"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel htmlFor="venue-name">
                        Nombre del recinto
                      </FormLabel>
                      <Input
                        {...field}
                        id="venue-name"
                        placeholder="Ej. Teatro Gran Rex"
                        className="h-11 border-white/10 bg-black/20"
                        readOnly={venueMode === "existing"}
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="venue.venueLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="venue-location">Dirección</FormLabel>
                      <Input
                        {...field}
                        id="venue-location"
                        placeholder="Calle y número"
                        className="h-11 border-white/10 bg-black/20"
                        readOnly={venueMode === "existing"}
                      />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  {zoneType === "general_admission" ? (
                    <FormField
                      control={form.control}
                      name="venue.capacity"
                      render={({ field, fieldState }) => (
                        <FormItem className="animate-in fade-in duration-300">
                          <FormLabel htmlFor="venue-capacity">
                            Capacidad total
                          </FormLabel>
                          <NumberInput
                            id="venue-capacity"
                            min={1}
                            value={field.value}
                            onChange={field.onChange}
                            className="h-11 border-white/10 bg-black/20"
                            disabled={venueMode === "existing"}
                          />
                          <FormMessage>
                            {fieldState.error?.message}
                          </FormMessage>
                        </FormItem>
                      )}
                    />
                  ) : (
                    <>
                      <FormField
                        control={form.control}
                        name="venue.rows"
                        render={({ field, fieldState }) => (
                          <FormItem className="animate-in fade-in duration-300">
                            <FormLabel htmlFor="venue-rows">
                              Cantidad de filas
                            </FormLabel>
                            <NumberInput
                              id="venue-rows"
                              min={1}
                              value={field.value}
                              onChange={field.onChange}
                              className="h-11 border-white/10 bg-black/20"
                              disabled={venueMode === "existing"}
                            />
                            <FormMessage>
                              {fieldState.error?.message}
                            </FormMessage>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="venue.seatsPerRow"
                        render={({ field, fieldState }) => (
                          <FormItem className="animate-in fade-in duration-300">
                            <FormLabel htmlFor="venue-seats-per-row">
                              Asientos por fila
                            </FormLabel>
                            <NumberInput
                              id="venue-seats-per-row"
                              min={1}
                              value={field.value}
                              onChange={field.onChange}
                              className="h-11 border-white/10 bg-black/20"
                              disabled={venueMode === "existing"}
                            />
                            <FormMessage>
                              {fieldState.error?.message}
                            </FormMessage>
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>

                {zoneType === "reserved_seating" && (
                  <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.05] p-4 text-sm text-violet-200">
                    Se prepararán{" "}
                    <strong>
                      {(venueRows ?? 0) * (venueSeatsPerRow ?? 0)}
                    </strong>{" "}
                    asientos numerados para generar el mapa inicial.
                    {venueMode === "existing" ? (
                      <span className="mt-1 block text-violet-300/70">
                        Capacidad y mapa heredados del venue — no editables.
                      </span>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </TabsContent>

            <TabsContent
              value="2"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-white">
                  Economía y Tiers
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Diseña tu estrategia de precios, cupos y recompensas.
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
                    className="border-0 bg-black/20 py-0 ring-1 ring-white/8"
                  >
                    <CardHeader className="flex-row items-center justify-between border-b border-white/6 px-5 py-4">
                      <div>
                        <CardTitle className="text-sm text-white">
                          Tier {index + 1}
                        </CardTitle>
                        <CardDescription className="text-xs text-zinc-600">
                          {(tier.sold ?? 0) > 0
                            ? `${tier.sold} reservadas/vendidas · no se puede eliminar`
                            : "Configuración comercial"}
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={fields.length === 1 || (tier.sold ?? 0) > 0}
                        onClick={() => remove(index)}
                        className="text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                        aria-label={`Eliminar tier ${index + 1}`}
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
                                Nombre
                              </FormLabel>
                              <Input
                                {...field}
                                id={`tier-${index}-name`}
                                placeholder="Ej. Preventa 1"
                                className="h-10 border-white/10 bg-black/20"
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
                                Capacidad
                              </FormLabel>
                              <NumberInput
                                id={`tier-${index}-capacity`}
                                min={1}
                                value={field.value}
                                onChange={(value) =>
                                  field.onChange(value ?? 0)
                                }
                                className="h-10 border-white/10 bg-black/20"
                              />
                              <FormMessage>
                                {fieldState.error?.message}
                              </FormMessage>
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="mb-4 flex items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                            <Armchair className="size-4" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              Modalidad de acceso
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              Vinculá esta entrada con un sector numerado del
                              recinto.
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
                                    className="h-10 w-full border-zinc-800 bg-zinc-950"
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
                                    ? "Este recinto no tiene sectores numerados configurados."
                                    : "La entrada general no necesita selección de ubicación."}
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
                                    Sector del plano
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
                                      className="h-10 w-full border-zinc-800 bg-zinc-950"
                                    >
                                      <SelectValue placeholder="Elegí un sector" />
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
                                  className="h-10 w-full border-white/10 bg-black/20"
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
                          <FormItem className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <EyeOff
                                className="mt-0.5 size-4 shrink-0 text-zinc-500"
                                aria-hidden="true"
                              />
                              <div>
                                <FormLabel className="text-sm text-zinc-200">
                                  Oculta al público
                                </FormLabel>
                                <FormDescription className="text-xs text-zinc-500">
                                  Solo RRPP / enlace exclusivo
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
                                className="block font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300"
                              >
                                Precio público al comprador
                              </FormLabel>
                              <div className="relative">
                                <CircleDollarSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
                                <NumberInput
                                  id={`tier-${index}-price`}
                                  min={0}
                                  step="0.01"
                                  value={field.value}
                                  onChange={(value) =>
                                    field.onChange(value ?? 0)
                                  }
                                  className="h-12 border-zinc-800 bg-zinc-950 pl-9"
                                />
                              </div>
                              <div className="my-3 space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 font-mono text-xs text-zinc-400">
                                <p>
                                  Precio público al comprador:{" "}
                                  <span className="text-zinc-200">
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
                                  Ingreso neto para el organizador
                                </span>
                                <span className="font-mono text-lg font-extrabold text-white">
                                  {formatCurrency(breakdown.basePrice)}
                                </span>
                              </div>
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
                          <AccordionTrigger className="rounded-xl bg-white/[0.025] px-4 text-zinc-300 hover:no-underline">
                            <span className="flex items-center gap-2">
                              <Gift className="size-4 text-violet-400" />
                              Opciones avanzadas · Smart Yield
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
                                      className="h-10 w-full border-white/10 bg-black/20"
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
                                    className="h-10 border-white/10 bg-black/20"
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
                  onClick={() =>
                    append({
                      name: `Preventa ${fields.length + 1}`,
                      price: 0,
                      capacity: 100,
                      timeLimit: "",
                      bonusReward: "",
                      dayId: null,
                      visibility: "public",
                      layoutType: "general",
                      seatingSectorId: null,
                      capacityPerUnit: 1,
                    })
                  }
                  className="h-11 w-full border-dashed border-white/12 bg-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-white"
                >
                  <Plus />
                  Agregar otro tipo de entrada
                </Button>

                <FormMessage>
                  {form.formState.errors.tickets?.root?.message}
                </FormMessage>
              </CardContent>
            </TabsContent>

            <TabsContent
              value="3"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-white">
                  Motor de Crecimiento
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Activa canales de distribución y aumenta el ticket promedio.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-6 py-7 lg:px-8">
                <FormField
                  control={form.control}
                  name="growth.isRRPPEnabled"
                  render={({ field }) => (
                    <FormItem className="rounded-2xl border border-white/8 bg-black/15 p-5">
                      <div className="flex items-start justify-between gap-5">
                        <div>
                          <FormLabel
                            htmlFor="growth-rrpp-enabled"
                            className="text-base text-white"
                          >
                            Sistema de RRPP / Tarjeteros
                          </FormLabel>
                          <FormDescription className="mt-1 max-w-xl">
                            Crea enlaces atribuibles y liquida comisiones
                            automáticamente mediante Split Payment.
                          </FormDescription>
                        </div>
                        <Switch
                          id="growth-rrpp-enabled"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-1 data-checked:bg-violet-600"
                        />
                      </div>

                      <div
                        className={cn(
                          "grid transition-all duration-300",
                          isRRPPEnabled
                            ? "mt-5 grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="overflow-hidden">
                          <FormField
                            control={form.control}
                            name="growth.commissionPercentage"
                            render={({ field: commission, fieldState }) => (
                              <FormItem className="max-w-sm">
                                <FormLabel htmlFor="growth-commission">
                                  Comisión base (%)
                                </FormLabel>
                                <NumberInput
                                  id="growth-commission"
                                  min={1}
                                  max={100}
                                  value={commission.value}
                                  onChange={commission.onChange}
                                  className="h-11 border-white/10 bg-black/20"
                                />
                                <FormMessage>
                                  {fieldState.error?.message}
                                </FormMessage>
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="growth.isAddonsEnabled"
                  render={({ field }) => (
                    <FormItem className="rounded-2xl border border-white/8 bg-black/15 p-5">
                      <div className="flex items-start justify-between gap-5">
                        <div>
                          <FormLabel
                            htmlFor="growth-addons-enabled"
                            className="text-base text-white"
                          >
                            Habilitar Add-ons
                          </FormLabel>
                          <FormDescription className="mt-1 max-w-xl">
                            Suma Parking, botellas, merchandising o experiencias
                            premium al checkout.
                          </FormDescription>
                        </div>
                        <Switch
                          id="growth-addons-enabled"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-1 data-checked:bg-violet-600"
                        />
                      </div>
                    </FormItem>
                  )}
                />

                <div className="rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/10 via-fuchsia-500/5 to-transparent p-5">
                  <p className="flex items-center gap-2 font-semibold text-cyan-100">
                    <Sparkles className="size-4 text-cyan-300" />
                    Multiplicá tus ventas hasta x3
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                    Al crear el evento vas a poder activar Tokepass Boost
                    (Silver, Gold o Platinum) y destacar esta noche en la
                    portada B2C.
                  </p>
                </div>

                <div className="rounded-2xl border border-violet-500/15 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.14),transparent_55%),rgba(124,58,237,0.04)] p-5">
                  <p className="flex items-center gap-2 font-medium text-violet-200">
                    <Rocket className="size-4" />
                    Configuración lista para escalar
                  </p>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">
                    Podrás sumar promotores y productos específicos después de
                    crear el evento.
                  </p>
                </div>

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

            <div className="flex items-center justify-between border-t border-white/8 px-6 py-5 lg:px-8">
              <Button
                type="button"
                variant="ghost"
                disabled={activeStep === 0 || form.formState.isSubmitting}
                onClick={() => setActiveStep((current) => current - 1)}
                className="text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <ArrowLeft />
                Anterior
              </Button>

              {activeStep < steps.length - 1 ? (
                <Button
                  key="next"
                  type="button"
                  onClick={() => void moveToStep(activeStep + 1)}
                  className="bg-violet-600 text-white hover:bg-violet-500"
                >
                  Continuar
                  <ArrowRight />
                </Button>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    key="draft"
                    type="submit"
                    disabled={form.formState.isSubmitting}
                    variant="outline"
                    className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                  >
                    {form.formState.isSubmitting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    {form.formState.isSubmitting
                      ? "Guardando…"
                      : "Guardar como borrador"}
                  </Button>
                  <Button
                    key="publish"
                    type="button"
                    disabled={form.formState.isSubmitting}
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
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
                      : "Publicar evento"}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </Tabs>
      </form>
    </Form>

    {boostEvent ? (
      <BoostModal
        open={Boolean(boostEvent)}
        onOpenChange={(open) => {
          if (!open) {
            setBoostEvent(null)
            router.push("/admin/events")
            router.refresh()
          }
        }}
        eventId={boostEvent.id}
        eventTitle={boostEvent.title}
      />
    ) : null}

    <PublishEventConfirmDialog
      eventId={publishConfirm.eventId}
      open={publishConfirm.open}
      onOpenChange={(open) =>
        setPublishConfirm((current) => ({ ...current, open }))
      }
      onPublished={() => {
        router.push(`/events/${publishConfirm.eventId}`)
        router.refresh()
      }}
    />
    </>
  )
}
