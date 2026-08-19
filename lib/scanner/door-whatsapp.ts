export const DOOR_PUBLIC_ENTRY = "tokepass.com.ar/puerta"

export function doorAccessWhatsAppText(input: {
  eventTitle: string
  pin: string
}): string {
  const title = input.eventTitle.trim() || "el evento"
  return `Acceso al escáner de TokePass para ${title}. Ingresa a ${DOOR_PUBLIC_ENTRY} y utiliza este PIN de acceso: ${input.pin}. No cierres la pestaña.`
}

export function doorAccessWhatsAppUrl(input: {
  eventTitle: string
  pin: string
}): string {
  return `https://wa.me/?text=${encodeURIComponent(doorAccessWhatsAppText(input))}`
}
