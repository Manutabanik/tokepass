"use server"

import { revalidatePath } from "next/cache"

import { loginUrlWithNext } from "@/lib/auth/post-login"
import { logger } from "@/lib/logger"
import { notifyTicketTransfer } from "@/lib/notifications"
import { getSeoOrigin } from "@/lib/seo/site"
import { createClient } from "@/lib/supabase/server"
import { mapClaimTransferError } from "@/lib/transfer/claim-errors"
import type { TicketTransferStatus } from "@/types/database"

export type TransferTicketInput = {
  ticketId: string
  receiverEmail: string
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
        | "unknown"
    }

type InitiateRpcRow = {
  transfer_id: string
  claim_token: string
  event_title: string
  receiver_email: string
}

function revalidateWalletPaths() {
  revalidatePath("/cuenta/entradas")
  revalidatePath("/profile/tickets")
  revalidatePath("/cuenta")
  revalidatePath("/claim")
  revalidatePath("/admin/scanner")
}

function mapTransferError(message: string): TransferTicketResult {
  const normalized = message.toUpperCase()

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
      error: "Ingresá un email válido.",
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
  if (normalized.includes("NOT_TICKET_OWNER") || normalized.includes("NOT_TRANSFER_SENDER")) {
    return {
      success: false,
      error: "Solo el titular puede transferir esta entrada.",
      code: "not_owner",
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

    const { data, error } = await supabase.rpc("initiate_ticket_transfer", {
      p_ticket_id: ticketId,
      p_receiver_email: receiverEmail,
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

    const claimUrl = `${getSeoOrigin()}/claim?token=${encodeURIComponent(row.claim_token)}`

    void notifyTicketTransfer({
      receiverEmail: row.receiver_email,
      eventTitle: row.event_title,
      senderUserId: user.id,
      claimUrl,
    }).catch((notifyError: unknown) => {
      logger.error({
        context: "transfer",
        message: "notify_failed",
        error: notifyError,
      })
    })

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
      loginUrl: loginUrlWithNext(`/claim?token=${raw}`),
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
        loginUrl: loginUrlWithNext(`/claim?token=${raw}`),
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

function logClaimFailure(context: string, error: {
  message: string
  code?: string
  details?: string
  hint?: string
}) {
  logger.error({
    context: "transfer",
    message: context,
    error: {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  })
}

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
      loginUrl: loginUrlWithNext(`/claim?token=${raw}`),
    }
  }

  const { data, error } = await supabase.rpc("claim_ticket_transfer_by_token", {
    p_token: raw,
  })

  if (error) {
    logClaimFailure("claim_by_token_failed", error)
    const mapped = mapClaimTransferError(error.message)
    if (mapped.code === "auth_required") {
      return {
        success: false,
        error: mapped.error,
        loginUrl: loginUrlWithNext(`/claim?token=${raw}`),
      }
    }
    return { success: false, error: mapped.error }
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

export type IncomingPendingGift = {
  transferId: string
  ticketId: string
  receiverEmail: string
  eventId: string | null
  eventTitle: string
  eventDate: string | null
  eventLocation: string
  flyerUrl: string | null
  tierName: string
  createdAt: string
}

export async function listIncomingPendingGiftsAction(): Promise<
  IncomingPendingGift[]
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase.rpc(
    "list_incoming_pending_ticket_transfers",
  )

  if (error) {
    logger.error({
      context: "transfer",
      message: "list_incoming_pending_failed",
      error: error.message,
    })
    return []
  }

  return (data ?? []).map((row) => ({
    transferId: row.transfer_id,
    ticketId: row.ticket_id,
    receiverEmail: row.receiver_email,
    eventId: row.event_id,
    eventTitle: row.event_title,
    eventDate: row.event_date,
    eventLocation: row.event_location ?? "",
    flyerUrl: row.flyer_url,
    tierName: row.tier_name,
    createdAt: row.created_at,
  }))
}

export async function claimIncomingTransferAction(
  transferId: string,
): Promise<ClaimTicketResult> {
  const id = transferId?.trim()
  if (!id) {
    return { success: false, error: "Transferencia no encontrada." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      success: false,
      error: "Iniciá sesión para reclamar esta entrada.",
      loginUrl: loginUrlWithNext("/cuenta/entradas"),
    }
  }

  const { data, error } = await supabase.rpc(
    "claim_ticket_transfer_as_receiver",
    { p_transfer_id: id },
  )

  if (error) {
    logClaimFailure("claim_as_receiver_failed", error)
    const mapped = mapClaimTransferError(error.message)
    if (mapped.code === "auth_required") {
      return {
        success: false,
        error: mapped.error,
        loginUrl: loginUrlWithNext("/cuenta/entradas"),
      }
    }
    return { success: false, error: mapped.error }
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

export type RejectTransferResult =
  | { success: true }
  | { success: false; error: string }

export async function rejectIncomingTransferAction(
  transferId: string,
): Promise<RejectTransferResult> {
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

  const { error } = await supabase.rpc("reject_ticket_transfer_as_receiver", {
    p_transfer_id: id,
  })

  if (error) {
    logClaimFailure("reject_as_receiver_failed", error)
    const mapped = mapClaimTransferError(error.message)
    if (mapped.code === "cancelled" || mapped.code === "not_pending") {
      return {
        success: false,
        error: "Esta transferencia ya no está pendiente.",
      }
    }
    if (mapped.code === "email_mismatch") {
      return { success: false, error: mapped.error }
    }
    return {
      success: false,
      error: mapped.error.startsWith("No se pudo reclamar")
        ? `No se pudo rechazar la entrada: ${error.message}`
        : mapped.error,
    }
  }

  revalidateWalletPaths()
  return { success: true }
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
