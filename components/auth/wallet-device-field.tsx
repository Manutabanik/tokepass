"use client"

import { useEffect, useState } from "react"

import {
  readOrCreateWalletDeviceId,
  WALLET_DEVICE_FORM_FIELD,
} from "@/lib/auth/wallet-device"

export function WalletDeviceField() {
  const [deviceId, setDeviceId] = useState("")

  useEffect(() => {
    setDeviceId(readOrCreateWalletDeviceId())
  }, [])

  return (
    <input type="hidden" name={WALLET_DEVICE_FORM_FIELD} value={deviceId} />
  )
}
