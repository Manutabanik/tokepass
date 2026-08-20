"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  cancelResaleListingAction,
  createResaleListingAction,
} from "@/app/actions/resale"
import type { MyTicket } from "@/app/actions/tickets"
import type { TicketVisualStatus } from "@/lib/ticket-visual-status"

export function useTicketResaleVisual(
  ticket: Pick<MyTicket, "visualStatus" | "activeResaleListingId">,
) {
  const router = useRouter()
  const [optimisticVisual, setOptimisticVisual] =
    useState<TicketVisualStatus | null>(null)
  const [optimisticListingId, setOptimisticListingId] = useState<string | null>(
    null,
  )
  const [pending, startTransition] = useTransition()

  const listingId = ticket.activeResaleListingId ?? optimisticListingId
  const resolvedVisual =
    optimisticVisual && optimisticVisual !== ticket.visualStatus
      ? optimisticVisual
      : null

  function publish(ticketId: string) {
    if (pending || ticket.visualStatus === "resale_pending") return
    setOptimisticVisual("resale_pending")
    startTransition(async () => {
      const result = await createResaleListingAction(ticketId, {
        termsAccepted: true,
      })
      if (!result.success) {
        setOptimisticVisual(null)
        toast.error(result.error)
        return
      }
      setOptimisticListingId(result.data.id)
      router.refresh()
    })
  }

  function withdraw() {
    if (pending || !listingId) return
    const previousId = listingId
    setOptimisticVisual("active")
    setOptimisticListingId(null)
    startTransition(async () => {
      const result = await cancelResaleListingAction(previousId)
      if (!result.success) {
        setOptimisticVisual("resale_pending")
        setOptimisticListingId(previousId)
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  return {
    optimisticVisual: resolvedVisual,
    listingId,
    pending,
    publish,
    withdraw,
  }
}
