const LIGHT_LABEL = "#e4e4e7"

function hexLuminance(hex: string): number | null {
  const raw = hex.startsWith("#") ? hex.slice(1) : hex
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function canvasLabelFill(color: string | undefined | null): string {
  const raw = color?.trim() ?? ""
  if (!raw) return LIGHT_LABEL
  const lowered = raw.toLowerCase()
  if (lowered === "black" || lowered === "#000" || lowered === "#000000") {
    return LIGHT_LABEL
  }
  const luminance = hexLuminance(raw)
  if (luminance != null && luminance < 0.45) return LIGHT_LABEL
  return raw
}
