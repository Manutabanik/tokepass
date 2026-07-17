"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleDollarSign,
  Gift,
  LoaderCircle,
  Plus,
  Rocket,
  Sparkles,
  Ticket,
  Trash2,
  UploadCloud,
} from "lucide-react"
import { useState } from "react"
import {
  useFieldArray,
  useForm,
  type FieldPath,
} from "react-hook-form"

import { createCompleteEvent } from "@/app/actions/events"
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
import {
  eventFormSchema,
  type EventFormValues,
} from "@/lib/validations/event-form"
import { cn } from "@/lib/utils"

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
  ],
  [
    "venue.zoneType",
    "venue.venueName",
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
  },
  venue: {
    zoneType: "general_admission",
    venueName: "",
    capacity: 500,
    rows: 20,
    seatsPerRow: 20,
  },
  tickets: [
    {
      name: "General",
      price: 0,
      capacity: 500,
      timeLimit: "",
      bonusReward: "",
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

export function EventCreationWizard() {
  const [activeStep, setActiveStep] = useState(0)
  const [highestStep, setHighestStep] = useState(0)
  const [resultMessage, setResultMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    mode: "onTouched",
    defaultValues,
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tickets",
  })

  const zoneType = form.watch("venue.zoneType")
  const isRRPPEnabled = form.watch("growth.isRRPPEnabled")
  const flyerName = form.watch("basics.flyerName")

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

  async function onSubmit(data: EventFormValues) {
    setResultMessage(null)
    console.log("[Tokepass event wizard]", data)

    const result = await createCompleteEvent(data)

    setResultMessage(
      result.success
        ? {
            type: "success",
            text: "Configuración validada. Ya está lista para persistirse.",
          }
        : { type: "error", text: result.error },
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Tabs
          value={String(activeStep)}
          onValueChange={(value) => void moveToStep(Number(value))}
          className="gap-6"
        >
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-white/8 bg-white/[0.025] p-2 lg:grid-cols-4">
            {steps.map(({ title, description, icon: Icon }, index) => {
              const completed = index < activeStep
              const available = index <= highestStep + 1

              return (
                <TabsTrigger
                  key={title}
                  value={String(index)}
                  disabled={!available}
                  className="h-auto min-w-0 justify-start gap-3 rounded-xl px-3 py-3 text-left data-active:bg-violet-500/12 data-active:text-white data-active:ring-1 data-active:ring-inset data-active:ring-violet-500/20"
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-500",
                      completed && "bg-emerald-500/10 text-emerald-400",
                      activeStep === index &&
                        "bg-violet-500/15 text-violet-300",
                    )}
                  >
                    {completed ? (
                      <Check className="size-4" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {index + 1}. {title}
                    </span>
                    <span className="hidden truncate text-[11px] text-zinc-600 sm:block">
                      {description}
                    </span>
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
            <TabsContent
              value="0"
              className="animate-in fade-in slide-in-from-right-2 duration-300"
            >
              <CardHeader className="border-b border-white/8 px-6 py-6 lg:px-8">
                <CardTitle className="text-xl text-white">
                  Esencia del Evento
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  Define cómo se presenta y cuándo ocurre la experiencia.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 px-6 py-7 lg:grid-cols-2 lg:px-8">
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="basics.title"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel htmlFor="event-title">Título</FormLabel>
                        <Input
                          {...field}
                          id="event-title"
                          placeholder="Ej. Neon City Festival"
                          className="h-11 border-white/10 bg-black/20"
                        />
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.date"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel htmlFor="event-date">Fecha y hora</FormLabel>
                        <Input
                          {...field}
                          id="event-date"
                          type="datetime-local"
                          className="h-11 border-white/10 bg-black/20 scheme-dark"
                        />
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="basics.description"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel htmlFor="event-description">
                          Descripción
                        </FormLabel>
                        <Textarea
                          {...field}
                          id="event-description"
                          placeholder="Cuenta qué hace única a esta experiencia..."
                          className="min-h-36 resize-none border-white/10 bg-black/20"
                        />
                        <FormDescription>
                          Este texto será visible en la página de venta.
                        </FormDescription>
                        <FormMessage>{fieldState.error?.message}</FormMessage>
                      </FormItem>
                    )}
                  />
                </div>

                <FormItem>
                  <FormLabel htmlFor="event-flyer">Flyer principal</FormLabel>
                  <label
                    htmlFor="event-flyer"
                    className="group grid min-h-72 cursor-pointer place-items-center rounded-2xl border border-dashed border-white/12 bg-black/15 p-8 text-center transition hover:border-violet-500/40 hover:bg-violet-500/[0.04]"
                  >
                    <span>
                      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-400 transition group-hover:scale-105">
                        <UploadCloud className="size-5" />
                      </span>
                      <span className="mt-4 block font-medium text-zinc-200">
                        {flyerName || "Sube el arte del evento"}
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-zinc-600">
                        PNG, JPG o WEBP. Recomendado 1600 × 900 px.
                      </span>
                    </span>
                    <Input
                      id="event-flyer"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(event) => {
                        form.setValue(
                          "basics.flyerName",
                          event.target.files?.[0]?.name ?? null,
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
                      />
                      <FormMessage>{fieldState.error?.message}</FormMessage>
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
                      {(form.watch("venue.rows") ?? 0) *
                        (form.watch("venue.seatsPerRow") ?? 0)}
                    </strong>{" "}
                    asientos numerados para generar el mapa inicial.
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
                {fields.map((tier, index) => (
                  <Card
                    key={tier.id}
                    className="border-0 bg-black/20 py-0 ring-1 ring-white/8"
                  >
                    <CardHeader className="flex-row items-center justify-between border-b border-white/6 px-5 py-4">
                      <div>
                        <CardTitle className="text-sm text-white">
                          Tier {index + 1}
                        </CardTitle>
                        <CardDescription className="text-xs text-zinc-600">
                          Configuración comercial
                        </CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                        className="text-zinc-600 hover:bg-red-500/10 hover:text-red-400"
                        aria-label={`Eliminar tier ${index + 1}`}
                      >
                        <Trash2 />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-5 px-5 py-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        <FormField
                          control={form.control}
                          name={`tickets.${index}.name`}
                          render={({ field, fieldState }) => (
                            <FormItem>
                              <FormLabel>Nombre</FormLabel>
                              <Input
                                {...field}
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
                          name={`tickets.${index}.price`}
                          render={({ field, fieldState }) => (
                            <FormItem>
                              <FormLabel>Precio</FormLabel>
                              <div className="relative">
                                <CircleDollarSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
                                <NumberInput
                                  min={0}
                                  step="0.01"
                                  value={field.value}
                                  onChange={(value) =>
                                    field.onChange(value ?? 0)
                                  }
                                  className="h-10 border-white/10 bg-black/20 pl-9"
                                />
                              </div>
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
                              <FormLabel>Capacidad</FormLabel>
                              <NumberInput
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

                      <Accordion>
                        <AccordionItem
                          value={`smart-yield-${tier.id}`}
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
                                  <FormLabel>Límite de ingreso</FormLabel>
                                  <Select
                                    value={field.value || "none"}
                                    onValueChange={(value) =>
                                      field.onChange(
                                        value === "none" ? "" : value,
                                      )
                                    }
                                  >
                                    <SelectTrigger className="h-10 w-full border-white/10 bg-black/20">
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
                                  <FormLabel>Premio por llegar antes</FormLabel>
                                  <Input
                                    {...field}
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
                ))}

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
                          <FormLabel className="text-base text-white">
                            Sistema de RRPP / Tarjeteros
                          </FormLabel>
                          <FormDescription className="mt-1 max-w-xl">
                            Crea enlaces atribuibles y liquida comisiones
                            automáticamente mediante Split Payment.
                          </FormDescription>
                        </div>
                        <Switch
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
                                <FormLabel>Comisión base (%)</FormLabel>
                                <NumberInput
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
                          <FormLabel className="text-base text-white">
                            Habilitar Add-ons
                          </FormLabel>
                          <FormDescription className="mt-1 max-w-xl">
                            Suma Parking, botellas, merchandising o experiencias
                            premium al checkout.
                          </FormDescription>
                        </div>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="mt-1 data-checked:bg-violet-600"
                        />
                      </div>
                    </FormItem>
                  )}
                />

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
                <Button
                  key="submit"
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="bg-violet-600 text-white hover:bg-violet-500"
                >
                  {form.formState.isSubmitting ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Rocket />
                  )}
                  {form.formState.isSubmitting
                    ? "Validando..."
                    : "Crear evento"}
                </Button>
              )}
            </div>
          </Card>
        </Tabs>
      </form>
    </Form>
  )
}
