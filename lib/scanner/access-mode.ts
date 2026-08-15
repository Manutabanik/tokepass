export type ScannerAccessMode = "guard" | "totem"

export const SCANNER_MODE_STORAGE_KEY = "tokepass-scanner-access-mode"

/** Móvil angosto = Guardia. Tablet / desktop = Tótem. */
export function preferredScannerAccessMode(viewportWidth: number): ScannerAccessMode {
  return viewportWidth < 768 ? "guard" : "totem"
}

export function readStoredScannerAccessMode(): ScannerAccessMode | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(SCANNER_MODE_STORAGE_KEY)
    if (raw === "totem" || raw === "guard") return raw
    return null
  } catch {
    return null
  }
}

export function readScannerAccessMode(): ScannerAccessMode {
  return (
    readStoredScannerAccessMode() ??
    preferredScannerAccessMode(
      typeof window === "undefined" ? 390 : window.innerWidth,
    )
  )
}

export function writeScannerAccessMode(mode: ScannerAccessMode) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SCANNER_MODE_STORAGE_KEY, mode)
  } catch {
    // private mode / quota
  }
}
