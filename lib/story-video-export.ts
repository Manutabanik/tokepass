import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
} from "@/lib/story-canvas"
import { specularFromTilt } from "@/lib/story-tilt"

export const STORY_VIDEO_DURATION_MS = 2000
export const STORY_VIDEO_FPS = 15
export const STORY_VIDEO_BITRATE = 1_200_000
export const MAX_STORY_VIDEO_BYTES = 3 * 1024 * 1024
export const MIN_STORY_VIDEO_BYTES = 8_000

const H264_MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=h264",
] as const

export type StoryVideoPose = {
  rotateX: number
  rotateY: number
  pulse: number
}

export type StoryVideoExport =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "unsupported" | "incompatible" | "too_large" | "failed" }

export function getSupportedMimeType(
  isTypeSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(type),
): string | null {
  return H264_MIME_TYPES.find((type) => isTypeSupported(type)) ?? null
}

export function isH264MimeType(type: string | null | undefined): boolean {
  if (!type) return false
  const normalized = type.toLowerCase()
  if (normalized.includes("vp8") || normalized.includes("vp9")) return false
  if (normalized.includes("av01") || normalized.includes("av1")) return false
  return (
    normalized.includes("avc1") ||
    normalized.includes("h264") ||
    normalized === "video/mp4"
  )
}

export function isMp4Container(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false
  return (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  )
}

export function isWebmContainer(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
}

export async function isWhatsAppMp4(blob: Blob): Promise<boolean> {
  if (blob.size <= MIN_STORY_VIDEO_BYTES || blob.size > MAX_STORY_VIDEO_BYTES) {
    return false
  }
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (isWebmContainer(header)) return false
  return isMp4Container(header)
}

export function storyVideoPose(progress: number): StoryVideoPose {
  const t = Math.min(1, Math.max(0, progress)) * Math.PI * 2
  return {
    rotateX: Math.sin(t + 0.65) * 8,
    rotateY: Math.sin(t) * 14,
    pulse: 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(t * 2)),
  }
}

export function drawStoryVideoFrame(
  ctx: CanvasRenderingContext2D,
  poster: CanvasImageSource,
  progress: number,
) {
  const width = STORY_CANVAS_WIDTH
  const height = STORY_CANVAS_HEIGHT
  const pose = storyVideoPose(progress)
  const spec = specularFromTilt({ x: pose.rotateX, y: pose.rotateY })
  const radX = (pose.rotateX * Math.PI) / 180
  const radY = (pose.rotateY * Math.PI) / 180

  ctx.fillStyle = "#050507"
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.transform(
    Math.cos(radY),
    Math.sin(radX) * 0.18,
    Math.sin(radY) * 0.18,
    Math.cos(radX),
    0,
    0,
  )
  ctx.drawImage(poster, -width / 2, -height / 2, width, height)
  ctx.restore()

  const neon = ctx.createRadialGradient(
    (spec.x / 100) * width,
    (spec.y / 100) * height,
    40,
    width / 2,
    height / 2,
    width * 0.72,
  )
  neon.addColorStop(0, `rgba(168,85,247,${0.08 + pose.pulse * 0.14})`)
  neon.addColorStop(1, "rgba(0,0,0,0)")
  ctx.globalCompositeOperation = "lighter"
  ctx.fillStyle = neon
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = "source-over"
}

function loadPoster(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("story_poster_failed"))
    image.src = src
  })
}

function waitForRecorder(recorder: MediaRecorder, chunks: BlobPart[]) {
  return new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => reject(new Error("story_recorder_failed"))
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: "video/mp4" }))
    }
  })
}

function mountCaptureCanvas(canvas: HTMLCanvasElement) {
  canvas.setAttribute("aria-hidden", "true")
  canvas.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;"
  document.body.appendChild(canvas)
}

async function waitAnimationFrame() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function recordH264Mp4(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  poster: CanvasImageSource,
  mime: string,
): Promise<Blob> {
  drawStoryVideoFrame(ctx, poster, 0)
  await waitAnimationFrame()

  const stream = canvas.captureStream(STORY_VIDEO_FPS)
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: STORY_VIDEO_BITRATE,
  })
  const chunks: BlobPart[] = []
  const done = waitForRecorder(recorder, chunks)

  recorder.start(250)

  await new Promise<void>((resolve) => {
    const started = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / STORY_VIDEO_DURATION_MS)
      drawStoryVideoFrame(ctx, poster, progress)
      if (progress < 1) {
        requestAnimationFrame(tick)
        return
      }
      resolve()
    }
    requestAnimationFrame(tick)
  })

  if (typeof recorder.requestData === "function") {
    recorder.requestData()
  }
  await waitAnimationFrame()
  recorder.stop()
  const blob = await done
  stream.getTracks().forEach((track) => track.stop())
  return blob
}

export async function exportStoryVideo(
  posterSrc: string,
): Promise<StoryVideoExport> {
  const mime = getSupportedMimeType()
  if (!mime || !isH264MimeType(mime)) {
    return { ok: false, reason: "unsupported" }
  }

  const poster = await loadPoster(posterSrc)
  const canvas = document.createElement("canvas")
  canvas.width = STORY_CANVAS_WIDTH
  canvas.height = STORY_CANVAS_HEIGHT
  const ctx = canvas.getContext("2d", { alpha: false })
  if (!ctx) return { ok: false, reason: "failed" }

  mountCaptureCanvas(canvas)
  try {
    const blob = await recordH264Mp4(canvas, ctx, poster, mime)
    if (blob.size > MAX_STORY_VIDEO_BYTES) {
      return { ok: false, reason: "too_large" }
    }
    if (!(await isWhatsAppMp4(blob))) {
      return { ok: false, reason: "incompatible" }
    }
    return { ok: true, blob }
  } catch {
    return { ok: false, reason: "failed" }
  } finally {
    canvas.remove()
  }
}
