/**
 * H-DOOR-1: el manifiesto y los leases locales no coordinan dispositivos.
 * Un segundo scanner offline puede admitir el mismo QR hasta que ambos
 * sincronicen. El modo online-first (C-DOOR-1) reduce la ventana; si el
 * dispositivo pierde red, hay que avisar y forzar resync frecuente.
 *
 * El snapshot online se refresca cada 20s. El SLO operativo offline es
 * OFFLINE_ADMISSION_SYNC_MINUTES.
 */
export const OFFLINE_ADMISSION_SYNC_MINUTES = 5

export function offlineDegradedModeMessage(
  minutes = OFFLINE_ADMISSION_SYNC_MINUTES,
): string {
  return `Modo degradado activo: Se requiere sincronización cada ${minutes} minutos para evitar dobles ingresos.`
}
