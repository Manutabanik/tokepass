export type RasterImageKind = "jpeg" | "png" | "webp"

const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const
const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] as const
const WEBP_MAGIC = [0x57, 0x41, 0x56, 0x45] as const

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((value, index) => bytes[index] === value)
}

export function detectRasterImageMagic(bytes: Uint8Array): RasterImageKind | null {
  if (startsWith(bytes, JPEG_MAGIC)) return "jpeg"
  if (startsWith(bytes, PNG_MAGIC)) return "png"
  if (
    bytes.length >= 12 &&
    startsWith(bytes, RIFF_MAGIC) &&
    bytes[8] === WEBP_MAGIC[0] &&
    bytes[9] === WEBP_MAGIC[1] &&
    bytes[10] === WEBP_MAGIC[2] &&
    bytes[11] === WEBP_MAGIC[3]
  ) {
    return "webp"
  }
  return null
}

export function rasterContentType(kind: RasterImageKind): string {
  if (kind === "jpeg") return "image/jpeg"
  if (kind === "png") return "image/png"
  return "image/webp"
}

export async function readFileBytes(file: File): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await file.arrayBuffer())
}

export function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type })
}
