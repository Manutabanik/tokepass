"use client"

import { LoaderCircle, Move, Ruler, Save, X } from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { toast } from "sonner"

import { saveTicketTemplate, type TicketTemplateRow } from "@/app/actions/print-studio-core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  clampZoneToPage,
  defaultTemplateLayout,
  formatPrintFolioPreview,
  matchMediumPreset,
  mmToScreenPx,
  moveZoneByMm,
  parseTemplateAssets,
  parseTemplateLayout,
  previewScaleToFit,
  PRINT_MEDIUM_PRESETS,
  PRINT_TEMPLATE_ZONE_LABELS,
  screenPxToMm,
  type PrintMediumPresetId,
  type PrintTemplateAssets,
  type PrintTemplateLayout,
  type PrintTemplateZone,
  type PrintTemplateZoneId,
} from "@/lib/print-studio"
import { cn } from "@/lib/utils"

const RULER_PX = 28

type DesignerState = {
  name: string
  presetId: PrintMediumPresetId
  widthMm: number
  heightMm: number
  layout: PrintTemplateLayout
  assets: PrintTemplateAssets
}

function stateFromTemplate(template?: TicketTemplateRow | null): DesignerState {
  const preset = matchMediumPreset(
    template?.medium ?? "press_sheet",
    template?.pageWidthMm ?? 150,
    template?.pageHeightMm ?? 70,
  )
  const widthMm = template?.pageWidthMm ?? preset.widthMm
  const heightMm = template?.pageHeightMm ?? preset.heightMm
  return {
    name: template?.name ?? preset.label,
    presetId: preset.id,
    widthMm,
    heightMm,
    layout: parseTemplateLayout(template?.layoutJson, preset.medium, widthMm, heightMm),
    assets: parseTemplateAssets(template?.assetsJson),
  }
}

function applyPreset(
  presetId: PrintMediumPresetId,
  name: string,
  assets: PrintTemplateAssets,
): DesignerState {
  const preset = PRINT_MEDIUM_PRESETS.find((item) => item.id === presetId) ?? PRINT_MEDIUM_PRESETS[0]
  return {
    name,
    presetId: preset.id,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    layout: defaultTemplateLayout(
      preset.medium,
      preset.widthMm,
      preset.heightMm,
      preset.flapMm,
    ),
    assets,
  }
}

export function TemplateDesigner({
  eventId,
  eventTitle,
  template,
  onClose,
  onSaved,
}: {
  eventId: string
  eventTitle: string
  template?: TicketTemplateRow | null
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [state, setState] = useState<DesignerState>(() => stateFromTemplate(template))
  const [selectedZone, setSelectedZone] = useState<PrintTemplateZoneId>("qr")
  const [pending, startTransition] = useTransition()
  const stageRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState({ w: 720, h: 520 })
  const dragRef = useRef<{
    id: PrintTemplateZoneId
    lastX: number
    lastY: number
  } | null>(null)

  const preset =
    PRINT_MEDIUM_PRESETS.find((item) => item.id === state.presetId) ?? PRINT_MEDIUM_PRESETS[0]

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      setAvail({
        w: Math.max(240, el.clientWidth - RULER_PX - 24),
        h: Math.max(220, el.clientHeight - RULER_PX - 24),
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = previewScaleToFit(state.widthMm, state.heightMm, avail.w, avail.h)
  const pageW = mmToScreenPx(state.widthMm) * scale
  const pageH = mmToScreenPx(state.heightMm) * scale
  const flapX = state.layout.flapMm > 0 ? mmToScreenPx(state.layout.flapMm) * scale : 0

  const zones = useMemo(
    () =>
      state.layout.zones.map((zone) =>
        clampZoneToPage(zone, state.widthMm, state.heightMm),
      ),
    [state.layout.zones, state.widthMm, state.heightMm],
  )

  function patchLayout(partial: Partial<PrintTemplateLayout>) {
    setState((prev) => ({ ...prev, layout: { ...prev.layout, ...partial } }))
  }

  function patchAssets(partial: Partial<PrintTemplateAssets>) {
    setState((prev) => ({ ...prev, assets: { ...prev.assets, ...partial } }))
  }

  function patchZone(id: PrintTemplateZoneId, partial: Partial<PrintTemplateZone>) {
    setState((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        zones: prev.layout.zones.map((zone) =>
          zone.id === id
            ? clampZoneToPage({ ...zone, ...partial }, prev.widthMm, prev.heightMm)
            : zone,
        ),
      },
    }))
  }

  function onPresetChange(next: string | null) {
    if (!next) return
    const presetId = next as PrintMediumPresetId
    setState((prev) => applyPreset(presetId, prev.name, prev.assets))
  }

  function onPointerDown(zoneId: PrintTemplateZoneId, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedZone(zoneId)
    dragRef.current = { id: zoneId, lastX: event.clientX, lastY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dxMm = screenPxToMm((event.clientX - drag.lastX) / scale)
    const dyMm = screenPxToMm((event.clientY - drag.lastY) / scale)
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    setState((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        zones: prev.layout.zones.map((zone) =>
          zone.id === drag.id
            ? moveZoneByMm(zone, dxMm, dyMm, prev.widthMm, prev.heightMm)
            : zone,
        ),
      },
    }))
  }

  function onPointerUp() {
    dragRef.current = null
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveTicketTemplate({
        eventId,
        templateId: template?.id ?? null,
        name: state.name,
        medium: preset.medium,
        pageWidthMm: state.widthMm,
        pageHeightMm: state.heightMm,
        dpi: 300,
        layoutJson: state.layout,
        assetsJson: {
          logoUrl: state.assets.logoUrl,
          bannerUrl: state.assets.bannerUrl,
          sponsorUrls: state.assets.sponsorUrls,
        },
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(template?.id ? "Plantilla actualizada." : "Plantilla guardada.")
      onSaved(result.id)
    })
  }

  const topTicks = Array.from({ length: Math.floor(state.widthMm / 10) + 1 }, (_, i) => i * 10)
  const sideTicks = Array.from({ length: Math.floor(state.heightMm / 10) + 1 }, (_, i) => i * 10)

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
            Diseñador
          </p>
          <h2 className="text-lg font-black text-foreground">
            {template?.id ? "Editar plantilla" : "Nueva plantilla"}
          </h2>
          <p className="text-xs text-muted-foreground">
            1 mm = {MM_LABEL} px en pantalla (96 DPI). Arrastrá las zonas para
            ubicarlas en milímetros reales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
            Cerrar
          </Button>
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Guardar plantilla
          </Button>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div
          ref={stageRef}
          className="min-h-[560px] overflow-auto bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.28)_1px,transparent_0)] [background-size:16px_16px] p-4 dark:bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.16)_1px,transparent_0)]"
        >
          <div
            className="relative mx-auto"
            style={{
              width: pageW + RULER_PX,
              height: pageH + RULER_PX,
            }}
          >
            <div
              className="absolute top-0 left-[28px] flex text-[9px] text-muted-foreground"
              style={{ width: pageW, height: RULER_PX }}
              aria-hidden="true"
            >
              {topTicks.map((mm) => (
                <span
                  key={`x-${mm}`}
                  className="absolute bottom-0 border-l border-zinc-400/70 pl-0.5 dark:border-zinc-500"
                  style={{ left: mmToScreenPx(mm) * scale }}
                >
                  {mm % 20 === 0 ? `${mm}` : ""}
                </span>
              ))}
            </div>
            <div
              className="absolute top-[28px] left-0 text-[9px] text-muted-foreground"
              style={{ width: RULER_PX, height: pageH }}
              aria-hidden="true"
            >
              {sideTicks.map((mm) => (
                <span
                  key={`y-${mm}`}
                  className="absolute right-0 border-t border-zinc-400/70 pr-0.5 dark:border-zinc-500"
                  style={{ top: mmToScreenPx(mm) * scale }}
                >
                  {mm % 20 === 0 ? `${mm}` : ""}
                </span>
              ))}
            </div>

            <div
              className="absolute overflow-hidden rounded-md border border-zinc-400 shadow-xl dark:border-zinc-600"
              style={{
                top: RULER_PX,
                left: RULER_PX,
                width: pageW,
                height: pageH,
                backgroundColor: state.layout.backgroundColor,
                backgroundImage: state.assets.bannerUrl
                  ? `linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.08)), url(${state.assets.bannerUrl})`
                  : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-2"
                style={{ backgroundColor: state.layout.primaryColor }}
              />
              {flapX > 0 ? (
                <div
                  className="pointer-events-none absolute inset-y-0 border-r border-dashed border-zinc-500/80"
                  style={{ left: flapX }}
                  aria-hidden="true"
                >
                  <span className="absolute top-1 left-1 text-[8px] font-semibold uppercase tracking-wider text-zinc-600">
                    Solapa {state.layout.flapMm} mm
                  </span>
                </div>
              ) : null}

              {zones
                .filter((zone) => zone.enabled)
                .map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    onPointerDown={(event) => onPointerDown(zone.id, event)}
                    className={cn(
                      "absolute cursor-grab overflow-hidden rounded-sm border border-dashed text-left active:cursor-grabbing",
                      selectedZone === zone.id
                        ? "z-20 border-emerald-500 bg-white/80 ring-2 ring-emerald-400/70 dark:bg-zinc-950/70"
                        : "z-10 border-zinc-400/70 bg-white/55 dark:bg-zinc-950/40",
                    )}
                    style={{
                      left: mmToScreenPx(zone.xMm) * scale,
                      top: mmToScreenPx(zone.yMm) * scale,
                      width: mmToScreenPx(zone.widthMm) * scale,
                      height: mmToScreenPx(zone.heightMm) * scale,
                      color: state.layout.primaryColor,
                    }}
                    aria-label={`${PRINT_TEMPLATE_ZONE_LABELS[zone.id]} ${zone.xMm.toFixed(0)} mm, ${zone.yMm.toFixed(0)} mm`}
                  >
                    <ZonePreview
                      zone={zone}
                      eventTitle={eventTitle}
                      layout={state.layout}
                      assets={state.assets}
                    />
                  </button>
                ))}
            </div>
          </div>
        </div>

        <aside className="max-h-[80vh] space-y-4 overflow-y-auto border-t border-border p-4 lg:border-t-0 lg:border-l">
          <div className="space-y-2">
            <Label htmlFor="template-name">Nombre</Label>
            <Input
              id="template-name"
              value={state.name}
              onChange={(event) =>
                setState((prev) => ({ ...prev, name: event.target.value }))
              }
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label>Soporte</Label>
            <Select value={state.presetId} onValueChange={onPresetChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINT_MEDIUM_PRESETS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label} · {item.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="page-w">Ancho (mm)</Label>
              <Input
                id="page-w"
                type="number"
                min={20}
                max={400}
                value={state.widthMm}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    widthMm: Math.max(20, Number(event.target.value) || prev.widthMm),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="page-h">Alto (mm)</Label>
              <Input
                id="page-h"
                type="number"
                min={20}
                max={400}
                value={state.heightMm}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    heightMm: Math.max(20, Number(event.target.value) || prev.heightMm),
                  }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ColorField
              label="Primario"
              value={state.layout.primaryColor}
              onChange={(primaryColor) => patchLayout({ primaryColor })}
            />
            <ColorField
              label="Secundario"
              value={state.layout.secondaryColor}
              onChange={(secondaryColor) => patchLayout({ secondaryColor })}
            />
            <ColorField
              label="Fondo"
              value={state.layout.backgroundColor}
              onChange={(backgroundColor) => patchLayout({ backgroundColor })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo del evento (URL)</Label>
            <Input
              id="logo-url"
              value={state.assets.logoUrl}
              onChange={(event) => patchAssets({ logoUrl: event.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="banner-url">Banner de fondo (URL)</Label>
            <Input
              id="banner-url"
              value={state.assets.bannerUrl}
              onChange={(event) => patchAssets({ bannerUrl: event.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sponsors-url">Logos de sponsors (una URL por línea)</Label>
            <Textarea
              id="sponsors-url"
              value={state.assets.sponsorUrls.join("\n")}
              onChange={(event) =>
                patchAssets({
                  sponsorUrls: event.target.value
                    .split(/\n/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Move className="size-3.5" aria-hidden="true" />
              Zonas
            </p>
            {zones.map((zone) => (
              <div key={zone.id} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className={cn(
                    "text-left text-sm",
                    selectedZone === zone.id ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                  onClick={() => setSelectedZone(zone.id)}
                >
                  {PRINT_TEMPLATE_ZONE_LABELS[zone.id]}
                </button>
                <Switch
                  checked={zone.enabled}
                  onCheckedChange={(enabled) => {
                    if (typeof enabled === "boolean") patchZone(zone.id, { enabled })
                  }}
                  aria-label={PRINT_TEMPLATE_ZONE_LABELS[zone.id]}
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="disclaimer">Disclaimer legal</Label>
            <Textarea
              id="disclaimer"
              value={state.layout.disclaimerText}
              onChange={(event) => patchLayout({ disclaimerText: event.target.value })}
              rows={3}
            />
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Ruler className="size-3.5" aria-hidden="true" />
            Lienzo {state.widthMm} x {state.heightMm} mm · escala {(scale * 100).toFixed(0)}%
          </p>
        </aside>
      </div>
    </section>
  )
}

const MM_LABEL = mmToScreenPx(1).toFixed(4)

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono text-xs"
        />
      </div>
    </div>
  )
}

function ZonePreview({
  zone,
  eventTitle,
  layout,
  assets,
}: {
  zone: PrintTemplateZone
  eventTitle: string
  layout: PrintTemplateLayout
  assets: PrintTemplateAssets
}) {
  if (zone.id === "qr") {
    return (
      <div className="grid h-full w-full place-items-center bg-white p-[8%]">
        <svg viewBox="0 0 21 21" className="h-full w-full text-zinc-950" aria-hidden="true">
          <rect width="21" height="21" fill="white" />
          <rect x="1" y="1" width="6" height="6" fill="currentColor" />
          <rect x="14" y="1" width="6" height="6" fill="currentColor" />
          <rect x="1" y="14" width="6" height="6" fill="currentColor" />
          <rect x="3" y="3" width="2" height="2" fill="white" />
          <rect x="16" y="3" width="2" height="2" fill="white" />
          <rect x="3" y="16" width="2" height="2" fill="white" />
          <rect x="9" y="3" width="2" height="2" fill="currentColor" />
          <rect x="12" y="9" width="3" height="2" fill="currentColor" />
          <rect x="9" y="12" width="2" height="4" fill="currentColor" />
          <rect x="14" y="14" width="2" height="2" fill="currentColor" />
        </svg>
      </div>
    )
  }

  if (zone.id === "logo") {
    return assets.logoUrl ? (
      // Preview accepts organizer-supplied hosts outside next/image remotePatterns.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={assets.logoUrl} alt="" className="h-full w-full object-contain" />
    ) : (
      <span className="grid h-full place-items-center px-1 text-[9px] font-semibold uppercase tracking-wide opacity-70">
        Logo
      </span>
    )
  }

  if (zone.id === "sponsors") {
    if (assets.sponsorUrls.length === 0) {
      return (
        <span className="grid h-full place-items-center px-1 text-[8px] uppercase tracking-wide opacity-70">
          Sponsors
        </span>
      )
    }
    return (
      <div className="flex h-full items-center gap-1 px-1">
        {assets.sponsorUrls.slice(0, 4).map((url) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="" className="h-full max-w-[28%] object-contain" />
        ))}
      </div>
    )
  }

  if (zone.id === "folio") {
    return (
      <span
        className="block h-full px-1 text-[10px] font-black leading-tight tracking-wide"
        style={{ color: layout.secondaryColor }}
      >
        {formatPrintFolioPreview("A", 1)}
      </span>
    )
  }

  if (zone.id === "holder") {
    return (
      <span className="block h-full px-1 text-[10px] font-semibold leading-tight">
        Juan Pérez
      </span>
    )
  }

  if (zone.id === "role") {
    return (
      <span
        className="block h-full px-1 text-[10px] font-black uppercase tracking-wider"
        style={{ color: layout.secondaryColor }}
      >
        Técnica
      </span>
    )
  }

  if (zone.id === "eventTitle") {
    return (
      <span className="block h-full overflow-hidden px-1 text-[10px] font-black leading-tight">
        {eventTitle}
      </span>
    )
  }

  return (
    <span className="block h-full overflow-hidden px-1 text-[7px] leading-tight opacity-80">
      {layout.disclaimerText}
    </span>
  )
}
