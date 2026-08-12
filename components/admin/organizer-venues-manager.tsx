"use client"

import {
  Building2,
  MapPin,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  createVenue,
  deleteVenue,
  uploadVenueSeatingBackground,
  updateVenue,
  type OrganizerVenue,
  type VenueZoneBlueprint,
} from "@/app/actions/venues"
import {
  VenueArgentinaSelector,
  type VenueArgentinaValue,
} from "@/components/admin/venue-argentina-selector"
import {
  createEmptyZone,
  SmartVenueBuilder,
  type VenueZoneDraft,
} from "@/components/admin/smart-venue-builder"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { formatNumber } from "@/lib/format"
import {
  getVenueSeatingItems,
  type VenueSeatingLayout,
} from "@/types/venues"

type Draft = {
  id?: string
  name: string
  address: string
  city: string
  capacity: string
  latitude: number | null
  longitude: number | null
  provinceId: string | null
  provinceName: string | null
  departmentId: string | null
  departmentName: string | null
  zones: VenueZoneDraft[]
  structured: boolean
  seatingBackgroundUrl: string | null
}

function emptyDraft(): Draft {
  return {
    name: "",
    address: "",
    city: "",
    capacity: "",
    latitude: null,
    longitude: null,
    provinceId: null,
    provinceName: null,
    departmentId: null,
    departmentName: null,
    zones: [createEmptyZone()],
    structured: false,
    seatingBackgroundUrl: null,
  }
}

function locationLabel(draft: Draft): string {
  if (draft.departmentName && draft.provinceName) {
    return `${draft.departmentName}, ${draft.provinceName}`
  }
  return draft.city.trim()
}

function draftToLocationValue(draft: Draft): VenueArgentinaValue {
  return {
    venueName: draft.name,
    province:
      draft.provinceId && draft.provinceName
        ? { id: draft.provinceId, name: draft.provinceName }
        : null,
    department:
      draft.departmentId && draft.departmentName
        ? { id: draft.departmentId, name: draft.departmentName }
        : null,
    address: draft.address,
    coordinates:
      draft.latitude != null && draft.longitude != null
        ? { lat: draft.latitude, lng: draft.longitude }
        : null,
    capacity: Number(draft.capacity) || 0,
  }
}

function zonesToDraft(
  venueId: string,
  zones: VenueZoneBlueprint[],
  seatingLayout: VenueSeatingLayout,
): VenueZoneDraft[] {
  return zones.map((zone, index) => {
    const seating = seatingLayout.find(
      (sector) => sector.sector_name === zone.name,
    )
    const legacyItems = seating ? getVenueSeatingItems(seating) : []
    const seatingRows =
      seating?.rows.length
        ? seating.rows
        : legacyItems.length > 0
          ? [
              {
                row_id: `${seating?.id ?? venueId}-legacy-row`,
                row_number: 1,
                row_label: "Fila 1",
                items: legacyItems,
              },
            ]
          : []
    return {
      key: seating?.id ?? `${venueId}-${index}`,
      name: zone.name,
      type: zone.type,
      layoutType: seating?.layout_type ?? "general",
      capacity: String(zone.capacity),
      rows: seatingRows.map((row) => ({
        key: row.row_id,
        label: row.row_label,
        itemCount: String(row.items.length),
        labelPrefix:
          seating?.layout_type === "numbered_seat" ? "Butaca " : "Mesa ",
        capacityPerUnit: String(
          row.items[0]?.capacity ?? seating?.capacity_per_unit ?? 1,
        ),
        items: row.items,
      })),
      color: seating?.color ?? "#10B981",
    }
  })
}

function draftZoneCapacity(zone: VenueZoneDraft, structured = true): number {
  if (!structured || zone.layoutType === "general") {
    return Number(zone.capacity) || 0
  }
  return zone.rows.reduce(
    (total, row) =>
      total +
      row.items.reduce(
        (subtotal, item) => subtotal + Math.max(1, item.capacity),
        0,
      ),
    0,
  )
}

function draftZonesToBlueprint(
  zones: VenueZoneDraft[],
  structured: boolean,
): VenueZoneBlueprint[] {
  return zones.map((zone) => ({
    name: zone.name.trim(),
    type: zone.layoutType === "general" ? zone.type : "general_admission",
    capacity: draftZoneCapacity(zone, structured),
    rows: null,
    seatsPerRow: null,
  }))
}

function draftZonesToSeatingLayout(
  zones: VenueZoneDraft[],
  structured: boolean,
): VenueSeatingLayout {
  return zones.map((zone) => {
    const defaultCapacity =
      zone.rows[0]?.items[0]?.capacity ??
      (Number(zone.rows[0]?.capacityPerUnit) || 1)
    return {
      id: zone.key,
      sector_name: zone.name.trim(),
      color: zone.color,
      pricing_tier_id: null,
      layout_type: structured ? zone.layoutType : "general",
      capacity_per_unit: Math.max(1, defaultCapacity || 1),
      rows:
        !structured || zone.layoutType === "general"
          ? []
          : zone.rows.map((row, index) => ({
              row_id: row.key,
              row_number: index + 1,
              row_label: row.label.trim(),
              items: row.items,
            })),
    }
  })
}

export function OrganizerVenuesManager({
  initialVenues,
}: {
  initialVenues: OrganizerVenue[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [uploadPending, startUploadTransition] = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)

  const sectorCapacity =
    draft?.zones.reduce(
      (sum, zone) => sum + draftZoneCapacity(zone, draft.structured),
      0,
    ) ?? 0

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-400">
            INFRAESTRUCTURA
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Recintos y Espacios
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Administrá los lugares de tus eventos, configurá ubicaciones en el
            mapa y diseñá los sectores de capacidad.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="h-11 rounded-xl bg-emerald-500 px-5 font-bold text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-400"
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo Recinto
        </Button>
      </header>

      {draft ? (
        <form
          className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 p-6 shadow-2xl sm:p-10"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              if (!draft.provinceId || !draft.departmentId) {
                toast.error(
                  "Seleccioná provincia y departamento de los listados oficiales.",
                )
                return
              }
              if (!draft.address.trim()) {
                toast.error("Elegí una dirección exacta en el buscador.")
                return
              }
              if (draft.latitude == null || draft.longitude == null) {
                toast.error(
                  "Falta el pin en el mapa. Seleccioná una dirección o tocá el mapa.",
                )
                return
              }

              const payload = {
                name: draft.name,
                location: draft.address.trim(),
                city: locationLabel(draft),
                latitude: draft.latitude,
                longitude: draft.longitude,
                capacity: Number(draft.capacity),
                zones: draftZonesToBlueprint(
                  draft.zones,
                  draft.structured,
                ),
                seatingLayout: draftZonesToSeatingLayout(
                  draft.zones,
                  draft.structured,
                ),
                seatingBackgroundUrl: draft.seatingBackgroundUrl,
              }
              const result = draft.id
                ? await updateVenue({ id: draft.id, ...payload })
                : await createVenue(payload)

              if (!result.success) {
                toast.error(result.error)
                return
              }

              toast.success(
                draft.id ? "Recinto actualizado" : "Recinto creado",
                {
                  description:
                    "La ubicación y los sectores quedaron guardados.",
                },
              )
              setDraft(null)
              router.refresh()
            })
          }}
        >
          <div className="mb-8 border-b border-zinc-800 pb-6">
            <h2 className="text-2xl font-bold text-white">
              {draft.id ? "Editar recinto" : "Nuevo recinto"}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Datos operativos, capacidad, sectores y posición geográfica.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Building2
                    className="size-4 text-emerald-400"
                    aria-hidden="true"
                  />
                  <h3 className="font-bold text-white">Datos generales</h3>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label
                      htmlFor="venue-name"
                      className="font-mono text-xs uppercase tracking-wider text-zinc-300"
                    >
                      Nombre del recinto
                    </Label>
                    <Input
                      id="venue-name"
                      required
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                      placeholder="Ej. Estadio Obras"
                      className="h-12 rounded-xl border-zinc-800 bg-zinc-950"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label
                      htmlFor="venue-capacity"
                      className="font-mono text-xs uppercase tracking-wider text-zinc-300"
                    >
                      Capacidad máxima general
                    </Label>
                    <Input
                      id="venue-capacity"
                      type="number"
                      min={1}
                      required
                      value={draft.capacity}
                      onChange={(event) =>
                        setDraft({ ...draft, capacity: event.target.value })
                      }
                      placeholder="2500"
                      className="h-12 rounded-xl border-zinc-800 bg-zinc-950"
                    />
                  </div>
                </div>
              </section>

              <div className="h-px bg-zinc-800" />

              <section className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    ¿Este recinto tiene ubicaciones numeradas, filas o mesas
                    asignadas?
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Apagado mantiene una configuración simple. Activado habilita
                    sectores y filas asimétricas.
                  </p>
                </div>
                <Switch
                  checked={draft.structured}
                  onCheckedChange={(structured) =>
                    setDraft({ ...draft, structured })
                  }
                  aria-label="Activar constructor de ubicaciones estructuradas"
                />
              </section>

              <SmartVenueBuilder
                structured={draft.structured}
                zones={draft.zones}
                onChange={(zones) => setDraft({ ...draft, zones })}
              />

              {draft.structured ? (
                <section className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400">
                    <ImageIcon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white">
                      Plano de referencia opcional
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      Subí un PNG o WEBP de hasta 3 MB para usarlo como fondo
                      visual del selector.
                    </p>
                    {draft.seatingBackgroundUrl ? (
                      <div
                        className="mt-4 aspect-[16/7] rounded-xl border border-zinc-800 bg-zinc-900 bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${draft.seatingBackgroundUrl}")`,
                        }}
                        role="img"
                        aria-label="Vista previa del plano del recinto"
                      />
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-zinc-800 px-4 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700">
                        <UploadCloud className="size-4" aria-hidden="true" />
                        {uploadPending ? "Subiendo…" : "Subir plano"}
                        <input
                          type="file"
                          accept="image/png,image/webp"
                          className="sr-only"
                          disabled={uploadPending}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (!file) return
                            startUploadTransition(async () => {
                              const formData = new FormData()
                              formData.set("file", file)
                              const result =
                                await uploadVenueSeatingBackground(formData)
                              if (!result.success) {
                                toast.error(result.error)
                                return
                              }
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      seatingBackgroundUrl: result.data.url,
                                    }
                                  : current,
                              )
                            })
                          }}
                        />
                      </label>
                      {draft.seatingBackgroundUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              seatingBackgroundUrl: null,
                            })
                          }
                          className="h-10 rounded-xl text-xs text-zinc-500 hover:text-red-400"
                        >
                          Quitar plano
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                </section>
              ) : null}

              <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-xs">
                <span className="text-zinc-500">Capacidad distribuida</span>
                <span
                  className={
                    sectorCapacity > Number(draft.capacity || 0)
                      ? "font-mono font-bold text-red-400"
                      : "font-mono font-bold text-emerald-400"
                  }
                >
                  {formatNumber(sectorCapacity)} /{" "}
                  {formatNumber(Number(draft.capacity) || 0)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <VenueArgentinaSelector
                key={draft.id ?? "new-venue"}
                showIdentityFields={false}
                value={draftToLocationValue(draft)}
                onChange={(location) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          address: location.address,
                          city:
                            location.department && location.province
                              ? `${location.department.name}, ${location.province.name}`
                              : current.city,
                          latitude: location.coordinates?.lat ?? null,
                          longitude: location.coordinates?.lng ?? null,
                          provinceId: location.province?.id ?? null,
                          provinceName: location.province?.name ?? null,
                          departmentId: location.department?.id ?? null,
                          departmentName: location.department?.name ?? null,
                        }
                      : current,
                  )
                }
              />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 border-t border-zinc-800 pt-6">
            <Button
              type="submit"
              disabled={pending}
              className="h-12 rounded-xl bg-emerald-500 px-6 font-bold text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-400"
            >
              {pending ? "Guardando…" : "Guardar Recinto"}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => setDraft(null)}
              className="h-12 rounded-xl bg-zinc-900 px-6 font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {initialVenues.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-16 text-center">
          <Building2 className="mx-auto size-9 text-zinc-700" />
          <h2 className="mt-4 font-bold text-white">Todavía no hay recintos</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Creá el primero para reutilizarlo en todos tus eventos.
          </p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {initialVenues.map((venue) => (
            <article
              key={venue.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 transition hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: venue.id,
                        name: venue.name,
                        address: venue.address || venue.location,
                        city: venue.city ?? "",
                        capacity: String(venue.capacity),
                        latitude: venue.latitude,
                        longitude: venue.longitude,
                        provinceId: null,
                        provinceName: null,
                        departmentId: null,
                        departmentName: null,
                        zones: zonesToDraft(
                          venue.id,
                          venue.zoneBlueprint,
                          venue.seatingLayout,
                        ),
                        structured: venue.seatingLayout.some(
                          (sector) => sector.layout_type !== "general",
                        ),
                        seatingBackgroundUrl: venue.seatingBackgroundUrl,
                      })
                    }
                    className="rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Eliminar el recinto "${venue.name}"?`,
                        )
                      ) {
                        return
                      }
                      startTransition(async () => {
                        const result = await deleteVenue(venue.id)
                        if (!result.success) {
                          toast.error(result.error)
                          return
                        }
                        toast.success("Recinto eliminado")
                        router.refresh()
                      })
                    }}
                    className="rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Eliminar
                  </Button>
                </div>
              </div>

              <h2 className="mt-4 text-lg font-bold text-white">{venue.name}</h2>
              <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-zinc-500">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {[venue.city, venue.address].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-2.5 py-1">
                  <Users className="size-3.5" aria-hidden="true" />
                  {formatNumber(venue.capacity)} personas
                </span>
                <span className="rounded-full bg-zinc-900 px-2.5 py-1">
                  {venue.zoneBlueprint.length}{" "}
                  {venue.zoneBlueprint.length === 1 ? "sector" : "sectores"}
                </span>
                {venue.latitude != null ? (
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
                    Ubicación verificada
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
