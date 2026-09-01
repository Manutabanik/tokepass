import "server-only"

import { cookies } from "next/headers"

import {
  createWalletDeviceId,
  normalizeWalletDeviceId,
  resolveIncomingWalletDeviceId,
  WALLET_DEVICE_COOKIE,
  walletDeviceCookieOptions,
} from "@/lib/auth/wallet-device"
import { logger } from "@/lib/logger"
import { createClient } from "@/lib/supabase/server"

export async function readWalletDeviceIdFromCookies(): Promise<string | null> {
  const store = await cookies()
  return normalizeWalletDeviceId(store.get(WALLET_DEVICE_COOKIE)?.value)
}

export async function writeWalletDeviceIdCookie(deviceId: string): Promise<void> {
  const normalized = normalizeWalletDeviceId(deviceId)
  if (!normalized) return
  const store = await cookies()
  store.set(WALLET_DEVICE_COOKIE, normalized, walletDeviceCookieOptions())
}

function isClaimOk(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  return (data as { ok?: unknown }).ok === true
}

export function isWalletDeviceAssertOk(data: unknown): boolean {
  return isClaimOk(data)
}

/**
 * Sobrescribe active_device_id con la huella de este dispositivo.
 * Si no hay id válido, genera uno y lo deja en la cookie.
 */
export async function bindWalletDeviceForCurrentUser(
  submittedDeviceId?: unknown,
): Promise<string | null> {
  const cookieId = await readWalletDeviceIdFromCookies()
  const deviceId =
    resolveIncomingWalletDeviceId(submittedDeviceId, cookieId) ??
    createWalletDeviceId()
  await writeWalletDeviceIdCookie(deviceId)

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("claim_active_wallet_device", {
    p_device_id: deviceId,
  })
  if (error || !isClaimOk(data)) {
    logger.error({
      context: "auth/wallet-device",
      message: "claim_failed",
      error: error?.message ?? "claim_rejected",
    })
    return null
  }
  return deviceId
}

