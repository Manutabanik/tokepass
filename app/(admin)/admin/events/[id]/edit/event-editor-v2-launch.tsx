"use client"

import { useState } from "react"
import { CircleAlert, CircleCheck, Eye, MapPin } from "lucide-react"
import Image from "next/image"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { toast } from "sonner"

import { updateEventAbsorbFees } from "@/app/actions/events-v2"
import { useEventEditorFee } from "./event-editor-fee-context"
import { EventEditorV2SettingsStep } from "./event-editor-v2-settings"
import { DraftHint, SplitRowSection } from "./event-editor-v2-ui"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  cheapestDraftTicketPrice,
  draftLaunchChecklist,
  draftLaunchPreview,
  draftLaunchPreviewLabel,
  simulateDraftSale,
} from "@/lib/events/launch-center-v2"
import {
  formatCurrency,
  formatDiscoveryDate,
  formatTicketPrice,
} from "@/lib/format"
import { fallbackServiceFeeRate } from "@/lib/pricing/event-fees"
import { cn } from "@/lib/utils"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2LaunchStep({
  eventId,
  isPublished,
  publishing,
  previewing,
  launchReady,
  launchBlockedReason,
  onPreview,
  onAbsorbHold,
}: {
  eventId: string
  isPublished: boolean
  publishing: boolean
  previewing: boolean
  launchReady: boolean
  launchBlockedReason?: string
  onPreview: () => void
  onAbsorbHold?: (hold: boolean) => void
}) {
  const { control } = useFormContext<EventDraftV2>()
  const [savingAbsorb, setSavingAbsorb] = useState(false)
  const fee = useEventEditorFee()
  const platformFeeRate = fee.isSponsoredByTokePass
    ? 0
    : fallbackServiceFeeRate(fee.platformFeePercentage)
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
  const hasMap = useWatch({ control, name: "hasMap" })
  const seatingMaps = useWatch({ control, name: "seatingMaps" })
  const seatingMap = useWatch({ control, name: "seatingMap" })

  const launchValues = {
    basicInfo: { name, startDate, locationName },
    location: { venueName },
    schedule,
    flyerUrl,
    bannerUrl,
    tickets,
    venueCapacity,
    hasMap,
    seatingMaps,
    seatingMap,
  }
  const samplePrice = cheapestDraftTicketPrice(tickets, launchValues)
  const sale =
    samplePrice == null
      ? null
      : simulateDraftSale(samplePrice, absorbFees, platformFeeRate)
  const preview = draftLaunchPreview(launchValues)
  const checks = draftLaunchChecklist(launchValues)

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-bold tracking-[0.18em] text-emerald-400 uppercase">
          Pre-Flight Checklist
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Semáforo rápido antes de abrir boletería.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {checks.map((item) => (
            <li
              key={item.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                item.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-400/40 bg-amber-400/10 text-amber-800 dark:text-amber-200",
              )}
            >
              {item.ok ? (
                <CircleCheck className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
              )}
              <span>{item.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {item.ok ? "Listo" : "Pendiente"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <SplitRowSection
        title="Estrategia de Venta"
        description={`Comisión de plataforma simulada: ${Math.round(platformFeeRate * 100)}%. El ticket de muestra es la entrada más barata.`}
      >
        <Controller
          name="settings.absorbFees"
          control={control}
          render={({ field }) => (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-3 py-3">
              <div className="min-w-0">
                <Label
                  htmlFor="event-v2-absorb-fees"
                  className="text-sm font-medium text-foreground"
                >
                  Absorber cargos
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Si está activo, el cliente paga el precio que cargaste y el
                  cargo se descuenta de tu liquidación.
                </p>
              </div>
              <Switch
                id="event-v2-absorb-fees"
                checked={Boolean(field.value)}
                disabled={savingAbsorb}
                onCheckedChange={(checked) => {
                  const previous = Boolean(field.value)
                  field.onChange(checked)
                  setSavingAbsorb(true)
                  onAbsorbHold?.(true)
                  void updateEventAbsorbFees(eventId, checked).then(
                    (result) => {
                      setSavingAbsorb(false)
                      onAbsorbHold?.(false)
                      if (result.success) return
                      field.onChange(previous)
                      toast.error(result.error)
                    },
                  )
                }}
                className="mt-0.5 shrink-0 data-checked:bg-emerald-500"
                aria-label="Absorber cargos"
                aria-busy={savingAbsorb}
              />
            </div>
          )}
        />

        {sale ? (
          <div className="rounded-md border bg-muted/30 p-4">
            <p className="text-sm tabular-nums text-foreground">
              Entrada {formatCurrency(sale.ticketPrice)}
              <span className="text-muted-foreground"> + </span>
              Cargo{" "}
              {absorbFees ? (
                <>
                  {formatCurrency(0)}{" "}
                  <span className="text-muted-foreground">
                    ({formatCurrency(sale.feeAmount)} absorbido)
                  </span>
                </>
              ) : (
                formatCurrency(sale.feeAmount)
              )}
              <span className="text-muted-foreground"> = </span>
              <span className="font-semibold">
                Total {formatCurrency(sale.customerPays)}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Recibís {formatCurrency(sale.organizerReceives)}
            </p>
          </div>
        ) : (
          <DraftHint>
            Agregá una entrada en el paso 2 para simular Entrada + Cargo =
            Total.
          </DraftHint>
        )}
      </SplitRowSection>

      <section className="mb-0 grid grid-cols-1 gap-8 border-b-0 pb-0 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Visibilidad del Evento
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Elegí si el evento aparece en el catálogo o solo con el link
              directo.
            </p>
          </div>
          <EventEditorV2SettingsStep
            eventId={eventId}
            isPublished={isPublished}
            onPersistHold={onAbsorbHold}
          />
        </div>
        <CatalogPreviewCard preview={preview} />
      </section>

      <div className="mt-8">
        <p className="text-sm text-muted-foreground">
          {launchReady
            ? isPublished
              ? "El evento ya está publicado. Usá Publicar abajo para actualizar ficha y entradas."
              : "Usá Publicar en la barra inferior cuando quieras subirlo al catálogo."
            : launchBlockedReason ||
              "Completá el checklist. Publicar te lleva al campo que falta."}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={!launchReady || publishing || previewing}
          className="mt-3 h-12 min-h-12"
          onClick={onPreview}
        >
          <Eye className="size-4" aria-hidden />
          {draftLaunchPreviewLabel(isPublished, previewing)}
        </Button>
      </div>
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
    <div>
      <p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-muted-foreground uppercase">
        Vista previa del catálogo
      </p>
      <article
        aria-label="Vista previa del evento en el catálogo"
        className="pointer-events-none relative aspect-[3/4] w-full max-w-[180px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 select-none"
      >
        {preview.imageUrl ? (
          <Image
            src={preview.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="180px"
            className="object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-emerald-950" />
        )}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2/3 bg-gradient-to-t from-black via-black/90 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-3">
          <span className="text-[10px] font-bold tracking-wide text-emerald-400 uppercase">
            {dateLabel}
          </span>
          <h3 className="mt-0.5 line-clamp-2 text-sm leading-tight font-black text-white">
            {preview.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-white/80">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{preview.locationName}</span>
          </p>
          <p className="mt-2 truncate text-xs font-black text-white">
            {priceLabel}
          </p>
        </div>
      </article>
    </div>
  )
}
