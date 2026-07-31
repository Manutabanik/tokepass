export type ScannerAccessMode = "guard" | "totem"

export const SCANNER_MODE_STORAGE_KEY = "tokepass-scanner-access-mode"

export function readScannerAccessMode(): ScannerAccessMode {
  if (typeof window === "undefined") return "guard"
  try {
    const raw = window.localStorage.getItem(SCANNER_MODE_STORAGE_KEY)
    return raw === "totem" ? "totem" : "guard"
  } catch {
    return "guard"
  }
}

export function writeScannerAccessMode(mode: ScannerAccessMode) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SCANNER_MODE_STORAGE_KEY, mode)
  } catch {
    // private mode / quota
  }
}
