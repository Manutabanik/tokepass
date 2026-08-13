"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { claimPendingTransfersAction } from "@/app/actions/transfer"

/**
 * Al entrar al portal, reclama entradas transferidas pendientes
 * (ej. regalos al email antes de tener cuenta).
 */
export function ClaimPendingTransfers() {
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void claimPendingTransfersAction()
      .then((count) => {
        if (count <= 0) return
        toast.success(
          count === 1
            ? "¡Se agregó 1 entrada regalada a tu billetera!"
            : `¡Se agregaron ${count} entradas regaladas a tu billetera!`,
        )
        router.refresh()
      })
      .catch(() => {
        // Silencioso: no bloquea el portal
      })
  }, [router])

  return null
}
