/**
 * Provincias vía API Georef (datos.gob.ar).
 * Cache en módulo + fallback estático si la red falla.
 */

const GEOREF_PROVINCIAS_URL =
  "https://apis.datos.gob.ar/georef/api/provincias?campos=id,nombre&max=100"

/** Fallback offline / API caída — nombres oficiales Georef. */
export const ARGENTINA_PROVINCES_FALLBACK = [
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Ciudad Autónoma de Buenos Aires",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego, Antártida e Islas del Atlántico Sur",
  "Tucumán",
] as const

type GeorefProvinciasResponse = {
  provincias?: Array<{ id?: string; nombre?: string }>
}

let cachedProvinces: string[] | null = null
let inflight: Promise<string[]> | null = null

function sortEs(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
}

export async function fetchArgentinaProvinces(): Promise<string[]> {
  if (cachedProvinces) return cachedProvinces
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const response = await fetch(GEOREF_PROVINCIAS_URL, {
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) {
        throw new Error(`Georef HTTP ${response.status}`)
      }
      const data = (await response.json()) as GeorefProvinciasResponse
      const names = (data.provincias ?? [])
        .map((row) => row.nombre?.trim())
        .filter((name): name is string => Boolean(name))
      const sorted = sortEs(names)
      cachedProvinces =
        sorted.length > 0 ? sorted : [...ARGENTINA_PROVINCES_FALLBACK]
      return cachedProvinces
    } catch {
      cachedProvinces = [...ARGENTINA_PROVINCES_FALLBACK]
      return cachedProvinces
    } finally {
      inflight = null
    }
  })()

  return inflight
}
