"use client"

import { useEffect } from "react"

import { signOutDueToWalletDeviceMismatch } from "@/app/actions/auth"
import { WALLET_DEVICE_MISMATCH_MESSAGE } from "@/lib/auth/wallet-device"
import { clearClientSessionArtifacts } from "@/lib/session-cleanup"

export function WalletDeviceMismatchLogout({
  nextPath,
}: {
  nextPath?: string
}) {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await clearClientSessionArtifacts()
      if (cancelled) return
      await signOutDueToWalletDeviceMismatch(nextPath)
    })()
    return () => {
      cancelled = true
    }
  }, [nextPath])

  return (
    <p role="alert" className="text-sm font-medium text-red-500">
      {WALLET_DEVICE_MISMATCH_MESSAGE}. Cerrando sesión…
    </p>
  )
}
