export const SCAN_REPLAY_HTTP_STATUS = 409 as const

export const SCAN_REPLAY_CODES = [
  "already_used",
  "already_used_today",
] as const

export type ScanReplayCode = (typeof SCAN_REPLAY_CODES)[number]

export function isScanReplayCode(
  code: string | null | undefined,
): code is ScanReplayCode {
  const normalized = code?.trim().toLowerCase() ?? ""
  return (
    normalized === "already_used" || normalized === "already_used_today"
  )
}

export function scanReplayHttpStatus(result: {
  success: boolean
  status?: string | null
  httpStatus?: number
}): 200 | 409 {
  if (result.httpStatus === SCAN_REPLAY_HTTP_STATUS) {
    return SCAN_REPLAY_HTTP_STATUS
  }
  if (!result.success && isScanReplayCode(result.status)) {
    return SCAN_REPLAY_HTTP_STATUS
  }
  return 200
}
