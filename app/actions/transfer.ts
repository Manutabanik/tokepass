"use server"

import { revalidatePath } from "next/cache"

import { loginUrlWithNext } from "@/lib/auth/post-login"
import {
  LEGAL_CONSENT_REQUIRED_ERROR,
  TICKET_TRANSFER_RESALE_TERMS_VERSION,
} from "@/lib/legal/terms"
import { logger } from "@/lib/logger"
import {
  attachTransferClaimUrl,
  scheduleNotificationOutboxDrain,
} from "@/lib/notifications/outbox"
import { getSeoOrigin } from "@/lib/seo/site"
import { buildTicketClaimUrl } from "@/lib/ticket-share"
import { createClient } from "@/lib/supabase/server"
import {
  evaluateTransferPolicy,
  resolveTicketEventStartsAt,
  TRANSFER_WINDOW_CLOSED_ERROR,
} from "@/lib/tickets/transfer-policy"
import type { TicketTransferStatus } from "@/types/database"

export type TransferTicketInput = {
  ticketId: string
  receiverEmail: string
  termsAccepted?: boolean
}

export type TransferTicketResult =
  | {
      success: true
      message: string
      transferId: string
      eventTitle: string
      receiverEmail: string
    }
  | {
      success: false
      error: string
      code?:
        | "auth_required"
        | "invalid_email"
        | "transfer_limit"
        | "not_owner"
        | "not_transferable"
        | "self_transfer"
        | "not_found"
        | "pending"
        | "listed"
        | "already_admitted"
        | "consent_required"
        | "window_closed"
        | "unknown"
    }

type InitiateRpcRow = {
  transfer_id: string
  claim_token: string
  event_title: string
  receiver_email: string
}

async function assertTicketTransferPolicy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticketId: string,
): Promise<Extract<TransferTicketResult, { success: false }> | null> {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("transfer_count, max_transfers_allowed, seating_unit_id, tier_id, event_id")
    .eq("id", ticketId)
    .maybeSingle()

  if (!ticket) return null

  const startsAt = await resolveTicketEventStartsAt(supabase, ticket)
  const decision = evaluateTransferPolicy({
    transferCount: ticket.transfer_count,
    maxTransfersAllowed: ticket.max_transfers_allowed,
    eventStartsAt: startsAt,
  })
  if (!decision.ok) {
    return {
      success: false,
      error: decision.error,
      code: decision.code,
    }
  }
  return null
}

function revalidateWalletPaths() {
  revalidatePath("/cuenta/entradas")
  revalidatePath("/profile/tickets")
  revalidatePath("/cuenta")
  revalidatePath("/claim")
  revalidatePath("/admin/scanner")
}

function mapTransferError(
  message: string,
): Extract<TransferTicketResult, { success: false }> {
  const normalized = message.toUpperCase()

  if (normalized.includes("CONSENT_REQUIRED")) {
    return {
      success: false,
      error: LEGAL_CONSENT_REQUIRED_ERROR,
      code: "consent_required",
    }
  }
  if (normalized.includes("AUTH_REQUIRED")) {
    return {
      success: false,
      error: "Debés iniciar sesión para transferir.",
      code: "auth_required",
    }
  }
  if (normalized.includes("INVALID_RECEIVER_EMAIL")) {
    return {
      success: false,
      error: "Escribí un correo válido (ej: nombre@gmail.com)",
      code: "invalid_email",
    }
  }
  if (normalized.includes("TRANSFER_LIMIT_REACHED")) {
    return {
      success: false,
      error: "Esta entrada ya alcanzó el límite de transferencias.",
      code: "transfer_limit",
    }
  }
  if (normalized.includes("TRANSFER_WINDOW_CLOSED")) {
    return {
      success: false,
      error: TRANSFER_WINDOW_CLOSED_ERROR,
      code: "window_closed",
    }
  }
  if (normalized.includes("NOT_TICKET_OWNER") || normalized.includes("NOT_TRANSFER_SENDER")) {
    return {
      success: false,
      error: "Solo el titular puede transferir esta entrada.",
      code: "not_owner",
    }
  }
  if (normalized.includes("TICKET_ALREADY_ADMITTED")) {
    return {
      success: false,
      error: "Esta entrada ya fue usada y no se puede transferir.",
      code: "already_admitted",
    }
  }
  if (normalized.includes("TICKET_NOT_TRANSFERABLE")) {
    return {
      success: false,
      error: "Esta entrada no se puede transferir (ya usada, anulada o transferida).",
      code: "not_transferable",
    }
  }
  if (normalized.includes("CANNOT_TRANSFER_TO_SELF")) {
    return {
      success: false,
      error: "No podés transferirte la entrada a vos mismo.",
      code: "self_transfer",
    }
  }
  if (normalized.includes("TICKET_NOT_FOUND") || normalized.includes("TRANSFER_NOT_FOUND")) {
    return {
      success: false,
      error: "Entrada no encontrada.",
      code: "not_found",
    }
  }
  if (normalized.includes("TICKET_TRANSFER_PENDING") || normalized.includes("TRANSFER_NOT_PENDING")) {
    return {
      success: false,
      error: "Esta entrada ya tiene una transferencia pendiente.",
      code: "pending",
    }
  }
  if (normalized.includes("TICKET_LISTED_FOR_RESALE")) {
    return {
      success: false,
      error: "Cancelá el aviso de reventa antes de transferir.",
      code: "listed",
    }
  }

  return {
    success: false,
    error: message || "No se pudo completar la transferencia.",
    code: "unknown",
  }
}

export async function transferTicketAction(
  input: TransferTicketInput,
): Promise<TransferTicketResult> {
  try {
    const ticketId = input.ticketId?.trim()
    const receiverEmail = input.receiverEmail?.trim().toLowerCase()

    if (!ticketId || !receiverEmail) {
      return {
        success: false,
        error: "Completá el email del destinatario.",
        code: "invalid_email",
      }
    }

    if (!input.termsAccepted) {
      return {
        success: false,
        error: LEGAL_CONSENT_REQUIRED_ERROR,
        code: "consent_required",
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        error: "Debés iniciar sesión para transferir.",
        code: "auth_required",
      }
    }

    const policy = await assertTicketTransferPolicy(supabase, ticketId)
    if (policy) return policy

    const { data, error } = await supabase.rpc("initiate_ticket_transfer", {
      p_ticket_id: ticketId,
      p_receiver_email: receiverEmail,
      p_terms_version: TICKET_TRANSFER_RESALE_TERMS_VERSION,
    })

    if (error) {
      return mapTransferError(error.message)
    }

    const rows = (data ?? []) as InitiateRpcRow[]
    const row = rows[0]

    if (!row) {
      return {
        success: false,
        error: "La transferencia no devolvió resultado.",
        code: "unknown",
      }
    }

    const claimUrl = buildTicketClaimUrl(getSeoOrigin(), row.claim_token)

    void attachTransferClaimUrl(row.transfer_id, claimUrl).catch(
      (notifyError: unknown) => {
        logger.error({
          context: "transfer",
          message: "outbox_claim_url_failed",
          error: notifyError,
        })
      },
    )
    scheduleNotificationOutboxDrain()

    revalidateWalletPaths()

    return {
      success: true,
      message: "Transferencia pendiente: el QR quedó bloqueado hasta que tu amigo la reclame.",
      transferId: row.transfer_id,
      eventTitle: row.event_title,
      receiverEmail: row.receiver_email,
    }
  } catch (error) {
    return mapTransferError(
      error instanceof Error ? error.message : "Error inesperado",
    )
  }
}

type ShareRpcRow = {
  transfer_id: string
  claim_token: string
  event_title: string
}

export async function startTicketShareTransferAction(
  ticketId: string,
  options?: { termsAccepted?: boolean },
): Promise<
  | {
      success: true
      transferId: string
      claimUrl: string
      eventTitle: string
    }
  | Extract<TransferTicketResult, { success: false }>
> {
  const id = ticketId?.trim()
  if (!id) {
    return { success: false, error: "Entrada no encontrada.", code: "not_found" }
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        success: false,
        error: "Debés iniciar sesión para transferir.",
        code: "auth_required",
      }
    }

    if (!options?.termsAccepted) {
      return {
        success: false,
        error: LEGAL_CONSENT_REQUIRED_ERROR,
        code: "consent_required",
      }
    }

    const policy = await assertTicketTransferPolicy(supabase, id)
    if (policy) return policy

    const { data, error } = await supabase.rpc("initiate_ticket_share_transfer", {
      p_ticket_id: id,
      p_terms_version: TICKET_TRANSFER_RESALE_TERMS_VERSION,
    })

    if (error) {
      return mapTransferError(error.message)
    }

    const row = ((data ?? []) as ShareRpcRow[])[0]
    if (!row) {
      return {
        success: false,
        error: "La transferencia no devolvió resultado.",
        code: "unknown",
      }
    }

    revalidateWalletPaths()

    return {
      success: true,
      transferId: row.transfer_id,
      claimUrl: buildTicketClaimUrl(getSeoOrigin(), row.claim_token),
      eventTitle: row.event_title,
    }
  } catch (error) {
    return mapTransferError(
      error instanceof Error ? error.message : "Error inesperado",
    )
  }
}

export type CancelTransferResult =
  | { success: true }
  | { success: false; error: string }

export async function cancelTicketTransferAction(
  transferId: string,
): Promise<CancelTransferResult> {
  const id = transferId?.trim()
  if (!id) {
    return { success: false, error: "Transferencia no encontrada." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "Debés iniciar sesión." }
  }

  const { error } = await supabase.rpc("cancel_ticket_transfer", {
    p_transfer_id: id,
  })

  if (error) {
    const normalized = error.message.toUpperCase()
    if (normalized.includes("TRANSFER_NOT_PENDING")) {
      return {
        success: false,
        error: "Ya no se puede cancelar: la entrada fue reclamada.",
      }
    }
    const mapped = mapTransferError(error.message)
    return {
      success: false,
      error: mapped.success ? error.message : mapped.error,
    }
  }

  revalidateWalletPaths()
  return { success: true }
}

export type ClaimTransferPreview =
  | {
      ok: true
      transferId: string
      status: TicketTransferStatus
      eventTitle: string
      eventDate: string | null
      flyerUrl: string | null
      receiverEmail: string
      emailMatches: boolean
      alreadyOwner: boolean
    }
  | { ok: false; error: string; loginUrl?: string }

export async function peekTicketTransferClaimAction(
  token: string,
): Promise<ClaimTransferPreview> {
  const raw = token?.trim()
  if (!raw) {
    return { ok: false, error: "Falta el enlace de reclamo." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      error: "Iniciá sesión para reclamar esta entrada.",
      loginUrl: loginUrlWithNext(`/claim/${raw}`),
    }
  }

  const { data, error } = await supabase.rpc("peek_ticket_transfer_claim", {
    p_token: raw,
  })

  if (error) {
    if (error.message.toUpperCase().includes("AUTH_REQUIRED")) {
      return {
        ok: false,
        error: "Iniciá sesión para reclamar esta entrada.",
        loginUrl: loginUrlWithNext(`/claim/${raw}`),
      }
    }
    return { ok: false, error: "No se pudo validar el enlace." }
  }

  const row = (data ?? [])[0]
  if (!row) {
    return {
      ok: false,
      error: "Este enlace es inválido o la transferencia ya no está disponible.",
    }
  }

  return {
    ok: true,
    transferId: row.transfer_id,
    status: row.status,
    eventTitle: row.event_title,
    eventDate: row.event_date,
    flyerUrl: row.flyer_url,
    receiverEmail: row.receiver_email,
    emailMatches: row.email_matches,
    alreadyOwner: row.already_owner,
  }
}

export type ClaimTicketResult =
  | { success: true; ticketId: string; eventTitle: string }
  | { success: false; error: string; loginUrl?: string }

export async function claimTicketTransferAction(
  token: string,
): Promise<ClaimTicketResult> {
  const raw = token?.trim()
  if (!raw) {
    return { success: false, error: "Falta el enlace de reclamo." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      success: false,
      error: "Iniciá sesión para reclamar esta entrada.",
      loginUrl: loginUrlWithNext(`/claim/${raw}`),
    }
  }

  const { data, error } = await supabase.rpc("claim_ticket_transfer_by_token", {
    p_token: raw,
  })

  if (error) {
    const normalized = error.message.toUpperCase()
    if (normalized.includes("AUTH_REQUIRED")) {
      return {
        success: false,
        error: "Iniciá sesión para reclamar esta entrada.",
        loginUrl: loginUrlWithNext(`/claim/${raw}`),
      }
    }
    if (normalized.includes("EMAIL_MISMATCH")) {
      return {
        success: false,
        error: "Esta entrada fue enviada a otro email. Ingresá con la cuenta destinataria.",
      }
    }
    if (normalized.includes("TRANSFER_EXPIRED")) {
      return {
        success: false,
        error: "Este enlace venció. Pedile que te reenvíe la entrada.",
      }
    }
    if (normalized.includes("TRANSFER_CANCELLED")) {
      return {
        success: false,
        error: "El envío fue cancelado por quien te la transfirió.",
      }
    }
    if (normalized.includes("TRANSFER_NOT_FOUND") || normalized.includes("INVALID_CLAIM_TOKEN")) {
      return {
        success: false,
        error: "Este enlace es inválido o ya no está disponible.",
      }
    }
    // P208: SQL only raises this for real tickets on published events.
    if (normalized.includes("MAX_TICKETS_PER_USER")) {
      return {
        success: false,
        error: "Alcanzaste el máximo de entradas para este evento.",
      }
    }
    if (normalized.includes("TICKET_ALREADY_ADMITTED")) {
      return {
        success: false,
        error: "Esta entrada ya fue usada y no se puede transferir.",
      }
    }
    return {
      success: false,
      error: "No se pudo reclamar la entrada. Probá de nuevo.",
    }
  }

  const row = (data ?? [])[0]
  if (!row) {
    return { success: false, error: "No se pudo reclamar la entrada." }
  }

  revalidateWalletPaths()
  return {
    success: true,
    ticketId: row.ticket_id,
    eventTitle: row.event_title,
  }
}

/** Asigna tickets transferidos pendientes al email del usuario actual (modelo legado / reventa). */
export async function claimPendingTransfersAction(): Promise<number> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return 0

  const { data, error } = await supabase.rpc("claim_pending_ticket_transfers", {
    p_user_id: user.id,
  })

  if (error) {
    logger.error({
      context: "transfer",
      message: "claim_failed",
      error: error.message,
    })
    return 0
  }

  const count = typeof data === "number" ? data : 0
  if (count > 0) {
    revalidateWalletPaths()
  }
  return count
}
