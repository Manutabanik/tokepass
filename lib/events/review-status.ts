import type { EventStatus } from "@/types/database"

export const EVENT_REVIEW_STATUSES = [
  "pending_approval",
  "needs_revision",
  "rejected",
] as const

export type EventReviewStatus = (typeof EVENT_REVIEW_STATUSES)[number]

export const EVENT_SENT_TO_REVIEW_TITLE = "Evento enviado a revisión"

export const EVENT_SENT_TO_REVIEW_BODY =
  "Para garantizar la calidad y seguridad de la cartelera de TokePass, nuestro equipo audita la información del evento antes de habilitar la venta al público. Te notificaremos una vez que esté activo."

export function isSandboxEventStatus(status: string | null | undefined) {
  return (
    status === "draft" ||
    status === "pending_approval" ||
    status === "needs_revision" ||
    status === "rejected"
  )
}

export function canSubmitEventForReview(status: string | null | undefined) {
  return (
    status === "draft" ||
    status === "needs_revision" ||
    status === "rejected"
  )
}

export function isPendingEventReview(status: string | null | undefined) {
  return status === "pending_approval"
}

export function isEventStatus(value: string): value is EventStatus {
  return (
    value === "draft" ||
    value === "pending_approval" ||
    value === "needs_revision" ||
    value === "rejected" ||
    value === "published" ||
    value === "paused" ||
    value === "cancelled" ||
    value === "completed" ||
    value === "archived"
  )
}
