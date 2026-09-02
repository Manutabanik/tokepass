/**
 * Búsqueda manual en la puerta. La admisión por esta vía es supervisada: el
 * staff ve nombre, DNI y estado antes de validar, y el manifiesto refleja
 * transferencias y reventas. Por eso alcanza con identificar al titular y
 * nunca hace falta que el portador conozca ningún secreto.
 */

/** Mínimo de caracteres para buscar por código; menos devuelve demasiado ruido. */
const MIN_CODE_QUERY_LENGTH = 4

export type ManifestSearchableTicket = {
  id: string
  owner_name: string
  dni: string | null
  ticket_tier: string
}

/** Deja solo alfanuméricos: el código se dicta con espacios o guiones. */
export function normalizeManifestCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase()
}

export function manifestTicketMatchesQuery(
  ticket: ManifestSearchableTicket,
  query: string,
): boolean {
  const text = query.trim().toLowerCase()
  if (text.length < 2) return false

  if (
    ticket.owner_name.toLowerCase().includes(text) ||
    (ticket.dni ?? "").toLowerCase().includes(text) ||
    ticket.ticket_tier.toLowerCase().includes(text)
  ) {
    return true
  }

  // `ticketBackupCode` imprime los primeros 12 caracteres del UUID sin
  // guiones debajo de cada QR. Un prefijo alcanza, y pegar el UUID completo
  // también, para que el staff pueda tipear lo que ve en la pantalla del
  // titular sin adivinar el formato.
  const code = normalizeManifestCode(text)
  if (code.length < MIN_CODE_QUERY_LENGTH) return false

  return normalizeManifestCode(ticket.id).startsWith(code)
}
