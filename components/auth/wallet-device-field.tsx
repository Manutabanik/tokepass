"use client"

import { useSyncExternalStore } from "react"

import {
  readWalletDeviceIdSnapshot,
  subscribeWalletDeviceId,
  WALLET_DEVICE_FORM_FIELD,
} from "@/lib/auth/wallet-device"

export function WalletDeviceField() {
  const deviceId = useSyncExternalStore(
    subscribeWalletDeviceId,
    readWalletDeviceIdSnapshot,
    () => "",
  )

  return (
    <input type="hidden" name={WALLET_DEVICE_FORM_FIELD} value={deviceId} />
  )
}
