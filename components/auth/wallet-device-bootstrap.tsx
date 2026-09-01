"use client"

import { useEffect } from "react"

import { readOrCreateWalletDeviceId } from "@/lib/auth/wallet-device"

/** Asegura device_id en cookie + localStorage antes de login y de pedir totp. */
export function WalletDeviceBootstrap() {
  useEffect(() => {
    readOrCreateWalletDeviceId()
  }, [])

  return null
}
