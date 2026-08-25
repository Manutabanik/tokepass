"use client"

import { CircleAlert, CircleCheck, Eye, MapPin, Rocket } from "lucide-react"
import Image from "next/image"
import { Controller, useFormContext, useWatch } from "react-hook-form"

import { EventEditorV2SettingsStep } from "./event-editor-v2-settings"
import { BENTO_GRID_CLASS, DraftCard, DraftHint } from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  cheapestDraftTicketPrice,
  draftLaunchChecklist,
  draftLaunchPreview,
  draftLaunchPreviewLabel,
  draftLaunchSubmitLabel,
  simulateDraftSale,
} from "@/lib/events/launch-center-v2"
import {
  formatCurrency,
  formatDiscoveryDate,
  formatTicketPrice,
} from "@/lib/format"
import { cn } from "@/lib/utils"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

const PLATFORM_FEE = 0.1

export function EventEditorV2LaunchStep({
  isPublished,
  publishing,
  previewing,
  launchReady,
  onPreview,
  onLaunch,
}: {
  isPublished: boolean
  publishing: boolean
  previewing: boolean
  launchReady: boolean
  onPreview: () => void
  onLaunch: () => void
}) {
  const { control } = useFormContext<EventDraftV2>()
  const tickets = useWatch({ control, name: "tickets" }) ?? []
  const absorbFees = Boolean(useWatch({ control, name: "settings.absorbFees" }))
  const name = useWatch({ control, name: "basicInfo.name" })
  const startDate = useWatch({ control, name: "basicInfo.startDate" })
  const locationName = useWatch({ control, name: "basicInfo.locationName" })
  const venueName = useWatch({ control, name: "location.venueName" })
  const flyerUrl = useWatch({ control, name: "flyerUrl" })
  const bannerUrl = useWatch({ control, name: "bannerUrl" })
  const venueCapacity = useWatch({ control, name: "venueCapacity" })
  const schedule = useWatch({ control, name: "schedule" })

  const samplePrice = cheapestDraftTicketPrice(tickets)
  const sale =
    samplePrice == null
      ? null
      : simulateDraftSale(samplePrice, absorbFees, PLATFORM_FEE)
  const preview = draftLaunchPreview({
    basicInfo: { name, startDate, locationName },
    location: { venueName },
    schedule,
    flyerUrl,
    bannerUrl,
    tickets,
    venueCapacity,
  })
  const checks = draftLaunchChecklist({
    basicInfo: { name, startDate },
    schedule,
    tickets,
    venueCapacity,
  })

  return (
    <div className={BENTO_GRID_CLASS}>
      <div className="md:col-span-12">
        <p className="text-xs font-bold tracking-[0.18em] text-emerald-400 uppercase">
          Centro de lanzamiento
        </p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-foreground">
          Revisión, precios y publicación
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controlá cómo se ve el evento, cómo se reparte el cargo de la
          plataforma y si está listo para abrir boletería.
        </p>
      </div>

      <CatalogPreviewCard preview={preview} />

      <DraftCard className="md:col-span-8">
          <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
                Estrategia de Venta
              </h3>
              <DraftHint>
                Comisión de plataforma simulada: {Math.round(PLATFORM_FEE * 100)}
                %. El ticket de muestra es la entrada más barata.
              </DraftHint>
            </div>
            <Controller
              name="settings.absorbFees"
              control={control}
              render={({ field }) => (
                <div className="flex shrink-0 items-center gap-2">
                  <Label
                    htmlFor="event-v2-absorb-fees"
                    className="text-xs font-bold text-slate-800 dark:text-zinc-200"
                  >
                    Absorber cargos
                  </Label>
                  <Switch
                    id="event-v2-absorb-fees"
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    className="data-checked:bg-emerald-500"
                    aria-label="Absorber cargos"
                  />
                </div>
              )}
            />
          </div>

          {sale ? (
            <div className="space-y-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/50">
              <p className="text-sm text-slate-700 dark:text-zinc-200">
                {absorbFees ? (
                  <>
                    Entrada: {formatCurrency(sale.ticketPrice)} | Cargo: -
                    {formatCurrency(sale.feeAmount)} (Absorbido). El cliente
                    paga {formatCurrency(sale.customerPays)} | Tú recibes{" "}
                    {formatCurrency(sale.organizerReceives)}.
                  </>
                ) : (
                  <>
                    Entrada: {formatCurrency(sale.ticketPrice)} | Cargo:{" "}
                    {formatCurrency(sale.feeAmount)}. El cliente paga{" "}
                    {formatCurrency(sale.customerPays)} | Tú recibes{" "}
                    {formatCurrency(sale.organizerReceives)}.
                  </>
                )}
              </p>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <BreakdownStat
                  label="El cliente paga"
                  value={formatCurrency(sale.customerPays)}
                />
                <BreakdownStat
                  label="Tú recibes"
                  value={formatCurrency(sale.organizerReceives)}
                  emphasis
                />
              </dl>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-muted-foreground dark:border-gray-700">
              Agregá una entrada en el paso 2 para simular el cobro con la
              comisión del 10%.
            </p>
          )}
        </DraftCard>

      <DraftCard className="md:col-span-12">
        <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
          Pre-Flight Checklist
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Semáforo rápido antes de abrir boletería. Verde listo, amarillo
          pendiente.
        </p>
        <ul className="mt-4 space-y-2">
          {checks.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40"
            >
              {item.ok ? (
                <CircleCheck
                  className="size-5 shrink-0 text-emerald-500"
                  aria-hidden
                />
              ) : (
                <CircleAlert
                  className="size-5 shrink-0 text-amber-400"
                  aria-hidden
                />
              )}
              <span className="text-sm font-medium text-slate-800 dark:text-zinc-100">
                {item.label}
              </span>
              <span className="ml-auto text-xs font-semibold text-muted-foreground">
                {item.ok ? "Listo" : "Pendiente"}
              </span>
            </li>
          ))}
        </ul>
      </DraftCard>

      <EventEditorV2SettingsStep />

      <div className="flex flex-col gap-3 border-t border-border/60 pt-6 md:col-span-12 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          {launchReady
            ? isPublished
              ? "El evento ya está en el catálogo. Podés probarlo como comprador o actualizarlo."
              : "Probá el borrador como comprador. Subilo al catálogo cuando esté listo."
            : "Completá el checklist para habilitar el envío."}
        </p>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!launchReady || publishing || previewing}
            className="h-12 min-h-12"
            onClick={onPreview}
          >
            <Eye className="size-4" aria-hidden />
            {draftLaunchPreviewLabel(isPublished, previewing)}
          </Button>
          <Button
            type="button"
            disabled={!launchReady || publishing || previewing}
            className={cn(
              "h-12 min-h-12 min-w-52 transition-all duration-200",
              launchReady
                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                : "cursor-not-allowed opacity-50",
            )}
            onClick={onLaunch}
          >
            <Rocket className="size-4" aria-hidden />
            {draftLaunchSubmitLabel(isPublished, publishing)}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BreakdownStat({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2",
        emphasis
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-white/80 text-slate-700 dark:bg-gray-950/60 dark:text-zinc-200",
      )}
    >
      <dt className="text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-black">{value}</dd>
    </div>
  )
}

function CatalogPreviewCard({
  preview,
}: {
  preview: ReturnType<typeof draftLaunchPreview>
}) {
  const dateLabel = preview.startDate
    ? formatDiscoveryDate(preview.startDate) || preview.startDate
    : "Sin fecha"
  const priceLabel =
    preview.minPrice == null
      ? "Ver precios"
      : preview.minPrice === 0
        ? "Gratis"
        : `Desde ${formatTicketPrice(preview.minPrice)}`

  return (
    <DraftCard className="overflow-hidden p-4 md:col-span-4">
      <p className="mb-3 text-[10px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
        Vista previa del catálogo
      </p>
      <article
        aria-label="Vista previa del evento en el catálogo"
        className="pointer-events-none relative mx-auto aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-xl select-none"
      >
        {preview.imageUrl ? (
          <Image
            src={preview.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="280px"
            className="object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-emerald-950" />
        )}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2/3 bg-gradient-to-t from-black via-black/90 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-5">
          <span className="text-xs font-bold tracking-wide text-emerald-400 uppercase">
            {dateLabel}
          </span>
          <h3 className="mt-1 line-clamp-2 text-lg leading-tight font-black text-white">
            {preview.name}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-white/80">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{preview.locationName}</span>
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">
                Precio
              </p>
              <p className="truncate text-sm font-black text-white">
                {priceLabel}
              </p>
            </div>
            <span className="rounded-xl bg-emerald-500/90 px-3 py-2 text-xs font-extrabold text-black">
              Comprar
            </span>
          </div>
        </div>
      </article>
    </DraftCard>
  )
}
