import {
  bytesToBlob,
  detectRasterImageMagic,
  rasterContentType,
  readFileBytes,
} from "@/lib/media/image-magic"
import { sanitizeSponsorSvg } from "@/lib/media/sanitize-svg"

export type PreparedSponsorLogo = {
  blob: Blob
  contentType: string
  extension: string
}

export async function prepareSponsorLogo(
  file: File,
): Promise<PreparedSponsorLogo | { error: string }> {
  const mime = file.type.toLowerCase()

  if (mime === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    const text = await file.text()
    const cleaned = sanitizeSponsorSvg(text)
    if (!cleaned) {
      return { error: "El SVG no es valido o contiene codigo no permitido." }
    }
    return {
      blob: new Blob([cleaned], { type: "image/svg+xml" }),
      contentType: "image/svg+xml",
      extension: "svg",
    }
  }

  const bytes = await readFileBytes(file)
  const kind = detectRasterImageMagic(bytes)
  if (!kind) {
    return { error: "El logo debe ser PNG, JPG, WEBP o un SVG limpio." }
  }

  return {
    blob: bytesToBlob(bytes, rasterContentType(kind)),
    contentType: rasterContentType(kind),
    extension: kind === "jpeg" ? "jpg" : kind,
  }
}
