"use client"

import { LoaderCircle, MapPinned, Search, X } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useId, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"

import {
  DRAFT_FIELD_CLASS,
  DraftCard,
  DraftFieldError,
  DraftHint,
} from "./event-editor-v2-ui"
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
import {
  fetchArgentinaDepartments,
  fetchArgentinaProvinces,
  type GeorefEntity,
} from "@/lib/georef/argentina"
import {
  searchNominatimArgentina,
  type NominatimResult,
} from "@/lib/georef/nominatim"
import {
  googleMapsDeepLink,
  VENUE_MAP_DEFAULT,
  type VenueCoordinates,
} from "@/lib/seating/venue-geo"
import { cn } from "@/lib/utils"
import {
  emptyEventDraftV2Location,
  type EventDraftV2,
  type EventDraftV2Location,
} from "@/lib/validations/event-draft-v2"

import "leaflet/dist/leaflet.css"

const VenueLeafletMap = dynamic(
  () =>
    import("@/components/admin/venue-leaflet-map").then(
      (module) => module.VenueLeafletMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-white text-sm text-muted-foreground dark:bg-zinc-950">
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Cargando mapa…
        </span>
      </div>
    ),
  },
)

function matchGeorefName(rows: GeorefEntity[], name: string) {
  const folded = name.trim().toLocaleLowerCase("es")
  if (!folded) return null
  return (
    rows.find((row) => row.name.toLocaleLowerCase("es") === folded) ??
    rows.find((row) => {
      const rowName = row.name.toLocaleLowerCase("es")
      return rowName.includes(folded) || folded.includes(rowName)
    }) ??
    null
  )
}

export function EventEditorV2LocationFields() {
  const listboxId = useId()
  const {
    register,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<EventDraftV2>()

  const location = watch("location") ?? emptyEventDraftV2Location()
  const [provinces, setProvinces] = useState<GeorefEntity[]>([])
  const [departments, setDepartments] = useState<GeorefEntity[]>([])
  const [loadingProvinces, setLoadingProvinces] = useState(true)
  const [loadingDepartments, setLoadingDepartments] = useState(false)
  const [georefError, setGeorefError] = useState<string | null>(null)
  const [query, setQuery] = useState(location.address ?? "")
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hasPinned, setHasPinned] = useState(() =>
    Boolean(location.address || location.lat != null),
  )
  const abortRef = useRef<AbortController | null>(null)
  const formAddress = location.address ?? ""

  useEffect(() => {
    setQuery(formAddress)
    if (formAddress || location.lat != null) setHasPinned(true)
    if (!formAddress && location.lat == null) setHasPinned(false)
  }, [formAddress, location.lat])

  function writeLocation(patch: Partial<EventDraftV2Location>) {
    const current = getValues("location") ?? emptyEventDraftV2Location()
    const next: EventDraftV2Location = {
      ...emptyEventDraftV2Location(),
      ...current,
      ...patch,
    }
    setValue("location", next, { shouldDirty: true, shouldTouch: true })
    if (patch.venueName != null) {
      setValue("basicInfo.locationName", patch.venueName, { shouldDirty: true })
    }
  }

  function clearLocation() {
    setQuery("")
    setResults([])
    setMenuOpen(false)
    setHasPinned(false)
    setValue("location", emptyEventDraftV2Location(), {
      shouldDirty: true,
      shouldTouch: true,
    })
    setValue("basicInfo.locationName", "", { shouldDirty: true })
  }

  useEffect(() => {
    let cancelled = false
    void fetchArgentinaProvinces()
      .then((rows) => {
        if (!cancelled) setProvinces(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setGeorefError(
            "No se pudieron cargar las provincias (Georef). Reintentá en unos segundos.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProvinces(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedProvince = matchGeorefName(provinces, location.province ?? "")
  const provinceId = selectedProvince?.id

  useEffect(() => {
    if (!provinceId) {
      setDepartments([])
      return
    }
    let cancelled = false
    setLoadingDepartments(true)
    void fetchArgentinaDepartments(provinceId)
      .then((rows) => {
        if (!cancelled) setDepartments(rows)
      })
      .catch(() => {
        if (!cancelled) {
          setDepartments([])
          setGeorefError("No se pudieron cargar los departamentos.")
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDepartments(false)
      })
    return () => {
      cancelled = true
    }
  }, [provinceId])

  useEffect(() => {
    if (!selectedProvince || selectedProvince.name === location.province) return
    writeLocation({ province: selectedProvince.name })
    // Official Georef name only; avoid looping on the same pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvince?.id, selectedProvince?.name])

  const selectedCity = matchGeorefName(departments, location.city ?? "")
  useEffect(() => {
    if (!selectedCity || selectedCity.name === location.city) return
    writeLocation({ city: selectedCity.name })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity?.id, selectedCity?.name])

  const trimmedQuery = query.trim()
  const searchBlocked =
    trimmedQuery.length < 3 ||
    (trimmedQuery === formAddress.trim() && hasPinned)

  useEffect(() => {
    if (searchBlocked) {
      setResults([])
      setSearching(false)
      return
    }
    const timer = window.setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setSearching(true)
      setSearchError(null)
      const scoped = [trimmedQuery, location.city, location.province]
        .filter(Boolean)
        .join(", ")
      void searchNominatimArgentina(scoped, {
        limit: 5,
        signal: controller.signal,
      })
        .then((rows) => {
          setResults(rows)
          setMenuOpen(rows.length > 0)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          setSearchError("No pudimos buscar direcciones. Intentá de nuevo.")
          setResults([])
        })
        .finally(() => setSearching(false))
    }, 500)
    return () => {
      window.clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [searchBlocked, trimmedQuery, location.city, location.province])

  function chooseResult(result: NominatimResult) {
    const province =
      matchGeorefName(provinces, result.address?.province ?? "")?.name ||
      result.address?.province ||
      location.province
    const city =
      matchGeorefName(departments, result.address?.city ?? "")?.name ||
      result.address?.city ||
      location.city
    setQuery(result.displayName)
    setResults([])
    setMenuOpen(false)
    setHasPinned(true)
    writeLocation({
      address: result.displayName,
      lat: result.lat,
      lng: result.lng,
      ...(province ? { province } : {}),
      ...(city ? { city } : {}),
    })
  }

  function onMapCoordinates(next: VenueCoordinates) {
    setHasPinned(true)
    writeLocation({ lat: next.latitude, lng: next.longitude })
  }

  const hasLocation =
    Boolean(location.venueName?.trim()) ||
    Boolean(location.address?.trim()) ||
    location.lat != null ||
    location.lng != null
  const uniqueProvinces = Array.from(
    new Map(provinces.map((row) => [row.id, row])).values(),
  )
  const uniqueDepartments = Array.from(
    new Map(departments.map((row) => [row.id, row])).values(),
  )
  const mapsHref =
    location.lat != null && location.lng != null
      ? googleMapsDeepLink(location.lat, location.lng)
      : null

  return (
    <DraftCard>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPinned className="size-4 text-emerald-400" aria-hidden />
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
              Ubicación
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Georef + Nominatim + Leaflet. Se guarda solo en el JSON del borrador.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hasLocation}
          onClick={clearLocation}
          className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
          Limpiar ubicación
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="grid gap-2 md:col-span-2">
          <Label
            htmlFor="event-v2-venue-name"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Nombre del lugar
          </Label>
          <Input
            id="event-v2-venue-name"
            className={DRAFT_FIELD_CLASS}
            placeholder="Ej. Club Atlético, Salón Norte"
            {...register("location.venueName", {
              onChange: (event) => {
                setValue("basicInfo.locationName", event.target.value, {
                  shouldDirty: true,
                })
              },
            })}
          />
          <DraftFieldError message={errors.location?.venueName?.message} />
        </div>

        <div className="grid gap-2">
          <Label
            htmlFor="event-v2-province"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Provincia
          </Label>
          <div className="relative">
            <Select
              value={selectedProvince?.id ?? ""}
              onValueChange={(value) => {
                const province = uniqueProvinces.find((row) => row.id === value)
                writeLocation({
                  province: province?.name ?? "",
                  city: "",
                })
              }}
              disabled={loadingProvinces}
              items={uniqueProvinces.map((province) => ({
                value: province.id,
                label: province.name,
              }))}
            >
              <SelectTrigger
                id="event-v2-province"
                className={cn(DRAFT_FIELD_CLASS, "max-w-full overflow-hidden")}
              >
                <SelectValue
                  placeholder={
                    loadingProvinces ? "Cargando provincias…" : "Seleccioná provincia"
                  }
                />
              </SelectTrigger>
              <SelectContent className="z-50 w-full">
                {uniqueProvinces.map((province) => (
                  <SelectItem key={province.id} value={province.id}>
                    {province.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingProvinces ? (
              <LoaderCircle className="pointer-events-none absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>

        <div className="grid gap-2">
          <Label
            htmlFor="event-v2-city"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Ciudad / Departamento
          </Label>
          <div className="relative">
            <Select
              value={selectedCity?.id ?? ""}
              onValueChange={(value) => {
                const city = uniqueDepartments.find((row) => row.id === value)
                writeLocation({ city: city?.name ?? "" })
              }}
              disabled={!selectedProvince || loadingDepartments}
              items={uniqueDepartments.map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            >
              <SelectTrigger
                id="event-v2-city"
                className={cn(DRAFT_FIELD_CLASS, "max-w-full overflow-hidden")}
              >
                <SelectValue
                  placeholder={
                    !selectedProvince
                      ? "Elegí provincia primero"
                      : loadingDepartments
                        ? "Cargando departamentos…"
                        : "Seleccioná departamento"
                  }
                />
              </SelectTrigger>
              <SelectContent className="z-50 w-full">
                {uniqueDepartments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingDepartments ? (
              <LoaderCircle className="pointer-events-none absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
        </div>

        <div className="relative z-50 grid gap-2 md:col-span-2">
          <Label
            htmlFor="event-v2-address"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Dirección exacta
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="event-v2-address"
              role="combobox"
              aria-expanded={menuOpen}
              aria-controls={listboxId}
              value={query}
              autoComplete="off"
              className={cn(DRAFT_FIELD_CLASS, "pl-9 pr-10")}
              placeholder={
                location.city
                  ? `Ej: Av. España 1234, ${location.city}`
                  : location.province
                    ? `Ej: Av. España 1234, ${location.province}`
                    : "Ej: Av. Corrientes 1660, CABA"
              }
              onChange={(event) => {
                setHasPinned(false)
                setQuery(event.target.value)
                setMenuOpen(true)
                writeLocation({ address: event.target.value })
              }}
              onFocus={() => {
                if (results.length > 0) setMenuOpen(true)
              }}
              onBlur={() => {
                window.setTimeout(() => setMenuOpen(false), 150)
              }}
            />
            {searching ? (
              <LoaderCircle className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {menuOpen && results.length > 0 ? (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%-0.25rem)] z-50 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
            >
              {results.map((result) => (
                <li key={result.placeId} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2.5 text-left text-xs leading-relaxed text-foreground transition hover:bg-slate-100 dark:hover:bg-zinc-700"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseResult(result)}
                  >
                    {result.displayName}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {searchError ? (
            <p className="text-xs text-red-500">{searchError}</p>
          ) : (
            <DraftHint>
              Escribí al menos 3 caracteres. Provincia y ciudad se completan solas si Nominatim las trae.
            </DraftHint>
          )}
          <DraftFieldError message={errors.location?.address?.message} />
        </div>
      </div>

      {georefError ? (
        <p className="mt-3 text-xs text-red-500">{georefError}</p>
      ) : null}

      <div className="relative z-0 mt-5 h-[300px] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-800">
        <VenueLeafletMap
          coordinates={
            location.lat != null && location.lng != null
              ? { latitude: location.lat, longitude: location.lng }
              : null
          }
          onChange={onMapCoordinates}
          zoom={location.lat != null ? 16 : 12}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {location.lat != null && location.lng != null
            ? `Coordenadas: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} · arrastrá el pin para afinar`
            : `Mapa centrado en Obelisco (${VENUE_MAP_DEFAULT.latitude}, ${VENUE_MAP_DEFAULT.longitude}) · elegí una dirección`}
        </p>
        {mapsHref ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
          >
            Abrir en Google Maps
          </a>
        ) : null}
      </div>
    </DraftCard>
  )
}
