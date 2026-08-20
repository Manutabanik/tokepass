"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import type { MyTicket } from "@/app/actions/tickets"
import {
  cancelTicketTransferAction,
  startTicketShareTransferAction,
} from "@/app/actions/transfer"
import { openWhatsAppTicketShare } from "@/lib/ticket-share"
import type { TicketVisualStatus } from "@/lib/ticket-visual-status"

export function useTicketTransferVisual(
  ticket: Pick<MyTicket, "visualStatus" | "pendingTransfer">,
) {
  const router = useRouter()
  const [optimisticVisual, setOptimisticVisual] =
    useState<TicketVisualStatus | null>(null)
  const [optimisticTransferId, setOptimisticTransferId] = useState<string | null>(
    null,
  )
  const [pending, startTransition] = useTransition()

  const resolvedVisual =
    optimisticVisual && optimisticVisual !== ticket.visualStatus
      ? optimisticVisual
      : null
  const visualStatus = resolvedVisual ?? ticket.visualStatus
  const transferId = ticket.pendingTransfer?.id ?? optimisticTransferId

  function sendToFriend(ticketId: string, eventTitle: string) {
    if (pending || visualStatus === "transfer_pending") return
    setOptimisticVisual("transfer_pending")
    startTransition(async () => {
      const result = await startTicketShareTransferAction(ticketId, {
        termsAccepted: true,
      })
      if (!result.success) {
        setOptimisticVisual(null)
        toast.error(result.error)
        return
      }
      setOptimisticTransferId(result.transferId)
      openWhatsAppTicketShare(result.claimUrl, eventTitle)
      router.refresh()
    })
  }

  function cancelSend() {
    if (pending || !transferId) return
    const previousId = transferId
    setOptimisticVisual("active")
    setOptimisticTransferId(null)
    startTransition(async () => {
      const result = await cancelTicketTransferAction(previousId)
      if (!result.success) {
        setOptimisticVisual("transfer_pending")
        setOptimisticTransferId(previousId)
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  return {
    visualStatus,
    optimisticVisual: resolvedVisual,
    transferId,
    pending,
    sendToFriend,
    cancelSend,
  }
}
