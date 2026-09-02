/**
 * Mensajes de error compartidos entre las Server Actions de checkout y los
 * servicios de dominio. Viven acá para que ambos lados usen exactamente el
 * mismo texto (son user-facing y se comparan en tests).
 */
export const EVENT_FINISHED_ERROR = "El evento ya ha finalizado"
export const EVENT_SOLD_OUT_ERROR = "El evento o sector se encuentra agotado"
export const GENERIC_CHECKOUT_ERROR = "Ocurrió un error al procesar tu solicitud"
