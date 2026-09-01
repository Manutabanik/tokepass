import { deviceClockOffsetMs } from "@/lib/totp-offline"

/** Epoch ms; descarta valores que no parecen un timestamp Unix en milisegundos. */
export function parseScannerServerTimestamp(raw: unknown): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  const ms = Math.trunc(value)
  if (ms < 1_000_000_000_000 || ms > 4_102_444_800_000) return null
  return ms
}

export function scannerClockOffsetFromSample(
  serverTimestampMs: unknown,
  deviceReceivedAtMs: number = Date.now(),
): number | null {
  const server = parseScannerServerTimestamp(serverTimestampMs)
  if (server == null) return null
  const device = Number(deviceReceivedAtMs)
  if (!Number.isFinite(device)) return null
  return deviceClockOffsetMs(server, device)
}
