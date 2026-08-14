export type VenuePlaceInput = {
  street?: string | null
  department?: string | null
  province?: string | null
  city?: string | null
}

export type VenuePlace = {
  /** Calle / dirección Nominatim, sin sufijos de lugar repetidos. */
  street: string
  /** "Departamento, Provincia" o null. */
  city: string | null
  /** Texto de vitrina: calle + lugar, sin concatenar un location previo. */
  display: string
}

function fold(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanPart(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim()
}

function includesPlace(haystack: string, needle: string) {
  if (!needle) return true
  return fold(haystack).includes(fold(needle))
}

function stripTrailingPlace(street: string, place: string) {
  if (!street || !place) return street
  let result = street.trim()
  const suffix = `, ${place}`
  while (fold(result).endsWith(fold(suffix))) {
    result = result.slice(0, result.length - suffix.length).trim()
  }
  if (fold(result) === fold(place)) return result
  return result
}

/**
 * Arma calle / ciudad / display desde campos puros.
 * Nunca reutiliza un `location` ya concatenado como si fuera la calle.
 */
export function composeVenuePlace(input: VenuePlaceInput): VenuePlace {
  const department = cleanPart(input.department)
  const province = cleanPart(input.province)
  const cityFromParts = [department, province].filter(Boolean).join(", ")
  const city = cityFromParts || cleanPart(input.city) || null

  let street = cleanPart(input.street)
  if (city) street = stripTrailingPlace(street, city)
  if (department) street = stripTrailingPlace(street, department)
  if (province) street = stripTrailingPlace(street, province)

  const bits = [street]
  if (department && !includesPlace(street, department)) bits.push(department)
  if (province && !includesPlace(bits.join(", "), province)) bits.push(province)
  if (!department && !province && city && !includesPlace(street, city)) {
    bits.push(city)
  }

  const display = bits.filter(Boolean).join(", ")
  return {
    street: street || display,
    city,
    display: display || street || city || "",
  }
}

export function venueDedupeKey(input: {
  name: string
  city?: string | null
  location?: string | null
}) {
  const place = composeVenuePlace({
    street: input.location,
    city: input.city,
  })
  return [fold(input.name), fold(place.city ?? ""), fold(place.street.slice(0, 64))].join("|")
}
