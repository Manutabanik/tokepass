"use server"

import { revalidatePath } from "next/cache"

import { logger } from "@/lib/logger"
import { notifyTicketTransfer } from "@/lib/notifications"
import { createClient } from "@/lib/supabase/server"

export type TransferTicketInput = {
  ticketId: string
  receiverEmail: string
}

export type TransferTicketResult =
  | {
      success: true
      message: string
      transferId: string
      newTicketId: string
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
        | "unknown"
    }

type TransferRpcRow = {
  transfer_id: string
  new_ticket_id: string
  event_title: string
  receiver_email: string
  receiver_user_id: string | null
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
  if (normalized.includes("NOT_TICKET_OWNER")) {
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
  if (normalized.includes("TICKET_NOT_FOUND")) {
    return {
      success: false,
      error: "Entrada no encontrada.",
      code: "not_found",
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

    const { data, error } = await supabase.rpc("execute_safe_transfer", {
      p_ticket_id: ticketId,
      p_receiver_email: receiverEmail,
    })

    if (error) {
      return mapTransferError(error.message)
    }

    const rows = (data ?? []) as TransferRpcRow[]
    const row = rows[0]

    if (!row) {
      return {
        success: false,
        error: "La transferencia no devolvió resultado.",
        code: "unknown",
      }
    }

    // Notificación en background (no bloquea ni revierte la TX atómica ya committed).
    void notifyTicketTransfer({
      receiverEmail: row.receiver_email,
      eventTitle: row.event_title,
      senderUserId: user.id,
    }).catch((notifyError: unknown) => {
      logger.error({
        context: "transfer",
        message: "notify_failed",
        error: notifyError,
      })
    })

    revalidatePath("/my-tickets")
    revalidatePath("/admin/scanner")

    return {
      success: true,
      message: "Entrada enviada con éxito",
      transferId: row.transfer_id,
      newTicketId: row.new_ticket_id,
      eventTitle: row.event_title,
      receiverEmail: row.receiver_email,
    }
  } catch (error) {
    return mapTransferError(
      error instanceof Error ? error.message : "Error inesperado",
    )
  }
}

/** Asigna tickets transferidos pendientes al email del usuario actual. */
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
    revalidatePath("/my-tickets")
  }
  return count
}
