export type GeorefEntity = {
  id: string
  name: string
}

export type GeorefEntityWithCenter = GeorefEntity & {
  center?: { lat: number; lng: number }
}

type GeorefListResponse<T> = {
  cantidad: number
  total: number
  provincias?: T[]
  departamentos?: T[]
}

type RawEntity = {
  id: string
  nombre: string
  centroide?: { lat: number; lon: number }
}

const GEOREF_BASE = "https://apis.datos.gob.ar/georef/api"

async function fetchGeorefJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`Georef HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

function mapEntity(raw: RawEntity): GeorefEntityWithCenter {
  const center =
    raw.centroide &&
    Number.isFinite(raw.centroide.lat) &&
    Number.isFinite(raw.centroide.lon)
      ? { lat: raw.centroide.lat, lng: raw.centroide.lon }
      : undefined
  return { id: String(raw.id), name: raw.nombre, center }
}

function uniqueGeorefEntities<T extends GeorefEntity>(rows: T[]): T[] {
  const byId = Array.from(new Map(rows.map((row) => [row.id, row])).values())
  const seenName = new Set<string>()
  const unique: T[] = []
  for (const row of byId) {
    const key = row.name.trim().toLocaleLowerCase("es")
    if (!key || seenName.has(key)) continue
    seenName.add(key)
    unique.push(row)
  }
  return unique
}

/** Provincias AR ordenadas alfabéticamente (API oficial Georef). */
export async function fetchArgentinaProvinces(): Promise<GeorefEntity[]> {
  const data = await fetchGeorefJson<GeorefListResponse<RawEntity>>(
    `${GEOREF_BASE}/provincias?campos=id,nombre&orden=nombre&max=50`,
  )
  return uniqueGeorefEntities(
    (data.provincias ?? []).map((row) => ({
      id: String(row.id),
      name: row.nombre,
    })),
  )
}

/** Departamentos/partidos de una provincia (incluye centroide para sesgar Places). */
export async function fetchArgentinaDepartments(
  provinceIdOrName: string,
): Promise<GeorefEntityWithCenter[]> {
  const params = new URLSearchParams({
    provincia: provinceIdOrName,
    campos: "id,nombre,centroide",
    orden: "nombre",
    max: "200",
  })
  const data = await fetchGeorefJson<GeorefListResponse<RawEntity>>(
    `${GEOREF_BASE}/departamentos?${params.toString()}`,
  )
  return uniqueGeorefEntities((data.departamentos ?? []).map(mapEntity))
}
