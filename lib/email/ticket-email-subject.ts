export const SANDBOX_TICKET_EMAIL_PREFIX = "[MODO PRUEBA]"

export function ticketConfirmationEmailSubject(
  eventTitle: string,
  options?: { isTest?: boolean },
): string {
  const title = eventTitle.trim() || "tu evento"
  const base = `¡Acá están tus entradas para ${title}!`
  if (!options?.isTest) return base
  return `${SANDBOX_TICKET_EMAIL_PREFIX} ${base}`
}
