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
  STUDIO_CONTROL_CLASS,
  STUDIO_LABEL_CLASS,
  STUDIO_SELECT_CONTENT_CLASS,
} from "@/lib/admin/studio-form-styles"
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
      <div className="grid h-full place-items-center bg-white dark:bg-zinc-950 text-sm text-muted-foreground">
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

const inputClassName = STUDIO_CONTROL_CLASS

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
  const [seenValue, setSeenValue] = useState(value)
  if (value && value !== seenValue) {
    setSeenValue(value)
    const next = normalizeValue({ ...state, ...value })
    const same =
      state.venueName === next.venueName &&
      state.address === next.address &&
      state.capacity === next.capacity &&
      state.province?.id === next.province?.id &&
      state.department?.id === next.department?.id &&
      state.coordinates?.lat === next.coordinates?.lat &&
      state.coordinates?.lng === next.coordinates?.lng
    if (!same) setState(next)
    if (value.address != null) setQuery(value.address)
    if (value.coordinates || value.address) setHasPinned(true)
  }

  const abortRef = useRef<AbortController | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const emit = useCallback(
    (next: VenueArgentinaValue) => {
      setState(next)
      onChange?.(next)
    },
    [onChange],
  )

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

  const provinceId = state.province?.id
  const [deptProvinceId, setDeptProvinceId] = useState(provinceId)
  if (provinceId !== deptProvinceId) {
    setDeptProvinceId(provinceId)
    setDepartments([])
    if (provinceId) setLoadingDepartments(true)
  }

  useEffect(() => {
    if (!provinceId) return
    let cancelled = false
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
    const current = state.province
    if (provinces.length === 0 || !current) return
    const match =
      provinces.find((row) => row.id === current.id) ??
      provinces.find(
        (row) =>
          row.name.toLocaleLowerCase("es") === current.name.toLocaleLowerCase("es"),
      )
    if (!match) return
    if (match.id === current.id && match.name === current.name) return
    const timer = window.setTimeout(() => {
      emit({ ...stateRef.current, province: { id: match.id, name: match.name } })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [emit, provinces, state.province])

  useEffect(() => {
    const current = state.department
    if (departments.length === 0 || !current) return
    const match =
      departments.find((row) => row.id === current.id) ??
      departments.find(
        (row) =>
          row.name.toLocaleLowerCase("es") === current.name.toLocaleLowerCase("es"),
      )
    if (!match) return
    if (match.id === current.id && match.name === current.name) return
    const timer = window.setTimeout(() => {
      emit({ ...stateRef.current, department: { id: match.id, name: match.name } })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [departments, emit, state.department])

  // Nominatim con debounce 500ms + cancelación.
  const trimmedQuery = query.trim()
  const searchBlocked =
    trimmedQuery.length < 3 ||
    disabled ||
    (trimmedQuery === state.address.trim() && hasPinned)
  if (searchBlocked) {
    if (results.length > 0) setResults([])
    if (searching) setSearching(false)
  }

  useEffect(() => {
    if (searchBlocked) return
    const trimmed = query.trim()
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
    searchBlocked,
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

  const uniqueProvinces = Array.from(
    new Map(provinces.map((row) => [row.id, row])).values(),
  )
  const uniqueDepartments = Array.from(
    new Map(departments.map((row) => [row.id, row])).values(),
  )

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <MapPinned className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-bold text-foreground">Ubicación en Argentina</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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
              className={STUDIO_LABEL_CLASS}
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
              className={STUDIO_LABEL_CLASS}
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
            className={STUDIO_LABEL_CLASS}
          >
            Provincia
          </Label>
          <div className="relative">
            <Select
              value={state.province?.id ?? ""}
              onValueChange={(value) => {
                if (value) onProvinceChange(value)
              }}
              disabled={disabled || loadingProvinces}
              items={uniqueProvinces.map((province) => ({
                value: province.id,
                label: province.name,
              }))}
            >
              <SelectTrigger
                id="venue-ar-province"
                className={cn(STUDIO_CONTROL_CLASS, "max-w-full overflow-hidden")}
              >
                <SelectValue
                  placeholder={
                    loadingProvinces ? "Cargando provincias…" : "Seleccioná provincia"
                  }
                />
              </SelectTrigger>
              <SelectContent
                alignItemWithTrigger={false}
                className={cn(STUDIO_SELECT_CONTENT_CLASS, "z-50 w-full")}
              >
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

        <div className="space-y-2">
          <Label
            htmlFor="venue-ar-department"
            className={STUDIO_LABEL_CLASS}
          >
            Departamento / Partido
          </Label>
          <div className="relative">
            <Select
              value={state.department?.id ?? ""}
              onValueChange={(value) => {
                if (value) onDepartmentChange(value)
              }}
              disabled={disabled || !state.province || loadingDepartments}
              items={uniqueDepartments.map((department) => ({
                value: department.id,
                label: department.name,
              }))}
            >
              <SelectTrigger
                id="venue-ar-department"
                className={cn(STUDIO_CONTROL_CLASS, "max-w-full overflow-hidden")}
              >
                <SelectValue
                  placeholder={
                    !state.province
                      ? "Elegí provincia primero"
                      : loadingDepartments
                        ? "Cargando departamentos…"
                        : "Seleccioná departamento"
                  }
                />
              </SelectTrigger>
              <SelectContent
                alignItemWithTrigger={false}
                className={cn(STUDIO_SELECT_CONTENT_CLASS, "z-50 w-full")}
              >
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
      </div>

      {georefError ? (
        <p className="text-xs text-rose-300">{georefError}</p>
      ) : null}

      <div className="relative z-50 space-y-2">
        <Label
          htmlFor="venue-ar-address"
          className={STUDIO_LABEL_CLASS}
        >
          Dirección exacta
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
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
            <LoaderCircle className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {menuOpen && results.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-56 overflow-auto rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 py-1 shadow-lg"
          >
            {results.map((result) => (
              <li
                key={result.placeId}
                role="option"
                aria-selected={false}
              >
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-xs leading-relaxed text-foreground transition hover:bg-slate-300 dark:hover:bg-zinc-700 hover:text-foreground"
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

      <div className="relative z-0 mt-4 h-[300px] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
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
        <p className="text-sm text-muted-foreground">
          {state.coordinates
            ? `Coordenadas: ${state.coordinates.lat.toFixed(6)}, ${state.coordinates.lng.toFixed(6)} · arrastrá el pin para afinar`
            : `Mapa centrado en Obelisco (${VENUE_MAP_DEFAULT.latitude}, ${VENUE_MAP_DEFAULT.longitude}) · elegí una dirección`}
        </p>
        {state.coordinates ? (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:text-emerald-300"
          >
            Abrir en Google Maps
          </a>
        ) : null}
      </div>
    </div>
  )
}
