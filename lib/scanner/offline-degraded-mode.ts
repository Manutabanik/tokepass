/**
 * H-DOOR-1: el manifiesto y los leases locales no coordinan dispositivos.
 * El slot de pistola se persiste en localStorage; sin setup no hay cámara.
 * Un segundo scanner offline de la misma gatera (mismo slot) aún puede
 * admitir el mismo QR hasta resync. El modo online-first reduce la ventana.
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
