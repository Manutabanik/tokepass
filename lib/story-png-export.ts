import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
} from "@/lib/story-canvas"

export const STORY_EXPORT_PIXEL_RATIO = 3
export const STORY_EXPORT_QUALITY = 1
export const STORY_EXPORT_MAX_BYTES = Math.round(3.5 * 1024 * 1024)
export const STORY_EXPORT_MIN_BYTES = Math.round(1.5 * 1024 * 1024)

const IMAGE_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

export type StoryPngOptions = {
  pixelRatio: number
  quality: number
  cacheBust: boolean
  width: number
  height: number
  skipAutoScale: boolean
  backgroundColor: string
  imagePlaceholder: string
  skipFonts: boolean
  style: {
    transform: string
    left: string
    top: string
  }
}

export function storyPngOptions(backgroundColor: string): StoryPngOptions {
  return {
    pixelRatio: STORY_EXPORT_PIXEL_RATIO,
    quality: STORY_EXPORT_QUALITY,
    cacheBust: false,
    width: STORY_CANVAS_WIDTH,
    height: STORY_CANVAS_HEIGHT,
    skipAutoScale: true,
    backgroundColor,
    imagePlaceholder: IMAGE_PLACEHOLDER,
    skipFonts: false,
    style: {
      transform: "none",
      left: "0",
      top: "0",
    },
  }
}

function loadBlobImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("story_png_scale_failed"))
    }
    image.src = url
  })
}

async function scalePngBlob(
  blob: Blob,
  width: number,
  height: number,
): Promise<Blob> {
  const image = await loadBlobImage(blob)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { alpha: false })
  if (!ctx) return blob
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(image, 0, 0, width, height)
  const next = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png", STORY_EXPORT_QUALITY)
  })
  return next ?? blob
}

export async function waitForStoryFlyerPaint(node: HTMLElement) {
  const flyer = node.querySelector<HTMLImageElement>("img[data-flyer-img]")
  if (flyer) {
    if (!flyer.complete || flyer.naturalWidth === 0) {
      await new Promise<void>((resolve) => {
        flyer.onload = () => resolve()
        flyer.onerror = () => resolve()
      })
    }
    if ("decode" in flyer) {
      await flyer.decode().catch(() => undefined)
    }
  }
  await new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 100)
  })
}

export async function fitStoryPngWeight(blob: Blob): Promise<Blob> {
  if (blob.size <= STORY_EXPORT_MAX_BYTES) return blob
  const fourK = await scalePngBlob(blob, 2160, 3840)
  if (fourK.size <= STORY_EXPORT_MAX_BYTES) return fourK
  return scalePngBlob(fourK, STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT)
}
