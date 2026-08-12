"use client"

/**
 * VenueArgentinaSelector (stack 100% gratis / open source)
 * ---------------------------------------------------------
 * - Provincia / Departamento: API Georef (datos.gob.ar)
 * - Dirección: Nominatim / OpenStreetMap (debounce 500ms)
 * - Mapa: Leaflet + react-leaflet (tiles OSM)
 *
 * Dependencias ya en el proyecto:
 *   leaflet, react-leaflet, @types/leaflet
 *
 * Importá CSS de Leaflet una sola vez en el layout admin o aquí:
 *   import "leaflet/dist/leaflet.css"
 *
 * Deep link al cliente (Google Maps / apps):
 *   import { googleMapsDeepLink } from "@/lib/seating/venue-geo"
 *   const href = googleMapsDeepLink(coords.lat, coords.lng)
 *   // <a href={href} target="_blank" rel="noreferrer">Cómo llegar</a>
 */

import { LoaderCircle, MapPinned, Search } from "lucide-react"
import dynamic from "next/dynamic"
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"

import {
  googleMapsDeepLink,
  VENUE_MAP_DEFAULT,
  type VenueCoordinates,
} from "@/lib/seating/venue-geo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  fetchArgentinaDepartments,
  fetchArgentinaProvinces,
  type GeorefEntity,
} from "@/lib/georef/argentina"
import {
  searchNominatimArgentina,
  type NominatimResult,
} from "@/lib/georef/nominatim"
import { cn } from "@/lib/utils"

import "leaflet/dist/leaflet.css"

const VenueLeafletMap = dynamic(
  () =>
    import("@/components/admin/venue-leaflet-map").then(
      (module) => module.VenueLeafletMap,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-zinc-950 text-sm text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Cargando mapa…
        </span>
      </div>
    ),
  },
)

export type VenueArgentinaValue = {
  venueName: string
  province: GeorefEntity | null
  department: GeorefEntity | null
  address: string
  /** null hasta que el usuario elija Nominatim / arrastre el pin. */
  coordinates: { lat: number; lng: number } | null
  capacity: number
}

type VenueArgentinaSelectorProps = {
  value?: Partial<VenueArgentinaValue>
  onChange?: (value: VenueArgentinaValue) => void
  showIdentityFields?: boolean
  className?: string
  disabled?: boolean
}

const selectClassName = cn(
  "h-11 w-full appearance-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white",
  "outline-none transition focus:border-transparent focus:ring-2 focus:ring-emerald-500",
  "disabled:cursor-not-allowed disabled:opacity-50",
)

const inputClassName = cn(
  "h-11 rounded-lg border-zinc-800 bg-zinc-900 text-sm text-white",
  "focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-emerald-500",
)

function normalizeValue(
  partial?: Partial<VenueArgentinaValue>,
): VenueArgentinaValue {
  const coords = partial?.coordinates
  return {
    venueName: partial?.venueName ?? "",
    province: partial?.province ?? null,
    department: partial?.department ?? null,
    address: partial?.address ?? "",
    coordinates:
      coords &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng)
        ? { lat: coords.lat, lng: coords.lng }
        : null,
    capacity: Number.isFinite(partial?.capacity)
      ? Math.max(0, Number(partial?.capacity))
      : 0,
  }
}

export function VenueArgentinaSelector({
  value,
  onChange,
  showIdentityFields = true,
  className,
  disabled = false,
}: VenueArgentinaSelectorProps) {
  const listboxId = useId()
  const [state, setState] = useState<VenueArgentinaValue>(() =>
    normalizeValue(value),
  )
  const [provinces, setProvinces] = useState<GeorefEntity[]>([])
  const [departments, setDepartments] = useState<GeorefEntity[]>([])
  const [loadingProvinces, setLoadingProvinces] = useState(true)
  const [loadingDepartments, setLoadingDepartments] = useState(false)
  const [georefError, setGeorefError] = useState<string | null>(null)

  const [query, setQuery] = useState(state.address)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hasPinned, setHasPinned] = useState(() =>
    Boolean(value?.coordinates || value?.address),
  )

  const abortRef = useRef<AbortController | null>(null)

  const emit = useCallback(
    (next: VenueArgentinaValue) => {
      setState(next)
      onChange?.(next)
    },
    [onChange],
  )

  useEffect(() => {
    if (!value) return
    setState((current) => {
      const next = normalizeValue({ ...current, ...value })
      const same =
        current.venueName === next.venueName &&
        current.address === next.address &&
        current.capacity === next.capacity &&
        current.province?.id === next.province?.id &&
        current.department?.id === next.department?.id &&
        current.coordinates?.lat === next.coordinates?.lat &&
        current.coordinates?.lng === next.coordinates?.lng
      return same ? current : next
    })
    if (value.address != null) setQuery(value.address)
    if (value.coordinates || value.address) setHasPinned(true)
  }, [value])

  useEffect(() => {
    let cancelled = false
    setLoadingProvinces(true)
    setGeorefError(null)
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

  useEffect(() => {
    const provinceId = state.province?.id
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
  }, [state.province?.id])

  // Nominatim con debounce 500ms + cancelación.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 3 || disabled) {
      setResults([])
      setSearching(false)
      return
    }

    // No re-buscar si ya eligió exactamente ese display_name.
    if (trimmed === state.address.trim() && hasPinned) {
      setResults([])
      return
    }

    const timer = window.setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setSearching(true)
      setSearchError(null)

      const scoped = [trimmed, state.department?.name, state.province?.name]
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
  }, [
    disabled,
    hasPinned,
    query,
    state.address,
    state.department?.name,
    state.province?.name,
  ])

  function onProvinceChange(provinceId: string) {
    const province = provinces.find((row) => row.id === provinceId) ?? null
    emit({
      ...state,
      province,
      department: null,
    })
  }

  function onDepartmentChange(departmentId: string) {
    const department =
      departments.find((row) => row.id === departmentId) ?? null
    emit({
      ...state,
      department: department
        ? { id: department.id, name: department.name }
        : null,
    })
  }

  function chooseResult(result: NominatimResult) {
    setQuery(result.displayName)
    setResults([])
    setMenuOpen(false)
    setHasPinned(true)
    emit({
      ...state,
      address: result.displayName,
      coordinates: { lat: result.lat, lng: result.lng },
    })
  }

  function onMapCoordinates(next: VenueCoordinates) {
    setHasPinned(true)
    setState((current) => {
      const updated: VenueArgentinaValue = {
        ...current,
        coordinates: { lat: next.latitude, lng: next.longitude },
      }
      onChange?.(updated)
      return updated
    })
  }

  const displayCoords = state.coordinates ?? {
    lat: VENUE_MAP_DEFAULT.latitude,
    lng: VENUE_MAP_DEFAULT.longitude,
  }

  const mapsHref = googleMapsDeepLink(displayCoords.lat, displayCoords.lng)

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
          <MapPinned className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-bold text-white">Ubicación en Argentina</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Georef (provincias/departamentos) + Nominatim (dirección) + Leaflet
            (mapa). Sin API keys de pago.
          </p>
        </div>
      </div>

      {showIdentityFields ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label
              htmlFor="venue-ar-name"
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-400"
            >
              Nombre del lugar
            </Label>
            <Input
              id="venue-ar-name"
              disabled={disabled}
              value={state.venueName}
              onChange={(event) =>
                emit({ ...state, venueName: event.target.value })
              }
              placeholder="Ej: Estadio Aldo Cantoni, Boliche Complejo X, Teatro Central"
              className={inputClassName}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label
              htmlFor="venue-ar-capacity"
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-400"
            >
              Cantidad de personas
            </Label>
            <Input
              id="venue-ar-capacity"
              type="number"
              min={0}
              disabled={disabled}
              value={state.capacity || ""}
              onChange={(event) =>
                emit({
                  ...state,
                  capacity: Number(event.target.value) || 0,
                })
              }
              placeholder="1000"
              className={inputClassName}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="venue-ar-province"
            className="font-mono text-[10px] uppercase tracking-wider text-zinc-400"
          >
            Provincia
          </Label>
          <div className="relative">
            <select
              id="venue-ar-province"
              disabled={disabled || loadingProvinces}
              value={state.province?.id ?? ""}
              onChange={(event) => onProvinceChange(event.target.value)}
              className={selectClassName}
            >
              <option value="">
                {loadingProvinces
                  ? "Cargando provincias…"
                  : "Seleccioná provincia"}
              </option>
              {provinces.map((province) => (
                <option key={province.id} value={province.id}>
                  {province.name}
                </option>
              ))}
            </select>
            {loadingProvinces ? (
              <LoaderCircle className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-500" />
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="venue-ar-department"
            className="font-mono text-[10px] uppercase tracking-wider text-zinc-400"
          >
            Departamento / Partido
          </Label>
          <div className="relative">
            <select
              id="venue-ar-department"
              disabled={disabled || !state.province || loadingDepartments}
              value={state.department?.id ?? ""}
              onChange={(event) => onDepartmentChange(event.target.value)}
              className={selectClassName}
            >
              <option value="">
                {!state.province
                  ? "Elegí provincia primero"
                  : loadingDepartments
                    ? "Cargando departamentos…"
                    : "Seleccioná departamento"}
              </option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            {loadingDepartments ? (
              <LoaderCircle className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-500" />
            ) : null}
          </div>
        </div>
      </div>

      {georefError ? (
        <p className="text-xs text-rose-300">{georefError}</p>
      ) : null}

      <div className="relative z-50 space-y-2">
        <Label
          htmlFor="venue-ar-address"
          className="font-mono text-[10px] uppercase tracking-wider text-zinc-400"
        >
          Dirección exacta
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <Input
            id="venue-ar-address"
            role="combobox"
            aria-expanded={menuOpen}
            aria-controls={listboxId}
            disabled={disabled || !state.province}
            value={query}
            onChange={(event) => {
              setHasPinned(false)
              setQuery(event.target.value)
              setMenuOpen(true)
            }}
            onFocus={() => {
              if (results.length > 0) setMenuOpen(true)
            }}
            onBlur={() => {
              // Delay para permitir click en el resultado.
              window.setTimeout(() => setMenuOpen(false), 150)
            }}
            placeholder={
              state.department
                ? `Ej: Av. España 1234, ${state.department.name}`
                : state.province
                  ? `Ej: Av. España 1234, ${state.province.name}`
                  : "Elegí provincia primero"
            }
            className={cn(inputClassName, "pl-9 pr-10")}
            autoComplete="off"
          />
          {searching ? (
            <LoaderCircle className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-zinc-500" />
          ) : null}
        </div>

        {menuOpen && results.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-56 overflow-auto rounded-md border border-zinc-700 bg-zinc-800 py-1 shadow-lg"
          >
            {results.map((result) => (
              <li key={result.placeId} role="option">
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-xs leading-relaxed text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
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
          <p className="text-xs text-rose-300">{searchError}</p>
        ) : (
          <p className="text-[11px] text-zinc-600">
            Escribí al menos 3 caracteres. Resultados vía Nominatim (OSM).
          </p>
        )}
      </div>

      <div className="relative z-0 mt-4 h-[300px] w-full overflow-hidden rounded-xl border border-zinc-800">
        <VenueLeafletMap
          coordinates={
            state.coordinates
              ? {
                  latitude: state.coordinates.lat,
                  longitude: state.coordinates.lng,
                }
              : null
          }
          onChange={onMapCoordinates}
          zoom={state.coordinates ? 16 : 12}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-400">
          {state.coordinates
            ? `Coordenadas: ${state.coordinates.lat.toFixed(6)}, ${state.coordinates.lng.toFixed(6)} · arrastrá el pin para afinar`
            : `Mapa centrado en Obelisco (${VENUE_MAP_DEFAULT.latitude}, ${VENUE_MAP_DEFAULT.longitude}) · elegí una dirección`}
        </p>
        {state.coordinates ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            Abrir en Google Maps
          </a>
        ) : null}
      </div>
    </div>
  )
}
