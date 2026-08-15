import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
} from "@/lib/story-canvas"
import { specularFromTilt } from "@/lib/story-tilt"

export const STORY_VIDEO_DURATION_MS = 2000
export const STORY_VIDEO_FPS = 30
export const MIN_STORY_VIDEO_BYTES = 100_000

export type StoryVideoPose = {
  rotateX: number
  rotateY: number
  pulse: number
}

export type StoryVideoExport =
  | { ok: true; blob: Blob; extension: "mp4" | "webm" }
  | { ok: false; reason: "unsupported" | "too_small" | "failed" }

export function storyVideoPose(progress: number): StoryVideoPose {
  const t = Math.min(1, Math.max(0, progress)) * Math.PI * 2
  return {
    rotateX: Math.sin(t + 0.65) * 8,
    rotateY: Math.sin(t) * 14,
    pulse: 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(t * 2)),
  }
}

export function pickVideoMimeType(
  isTypeSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported(type),
): string | null {
  const types = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ]
  return types.find((type) => isTypeSupported(type)) ?? null
}

export function videoExtensionForMime(mime: string): "mp4" | "webm" {
  return mime.includes("mp4") ? "mp4" : "webm"
}

export function isUsableStoryVideo(blob: Blob | null | undefined): boolean {
  return Boolean(blob && blob.size > MIN_STORY_VIDEO_BYTES)
}

export function isAppleWebKit(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  maxTouchPoints = typeof navigator === "undefined"
    ? 0
    : navigator.maxTouchPoints,
): boolean {
  if (/iP(ad|hone|od)/i.test(userAgent)) return true
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1
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

  const glare = ctx.createLinearGradient(
    -width / 2,
    -height / 2,
    width / 2,
    height / 2,
  )
  glare.addColorStop(0, "rgba(255,255,255,0)")
  glare.addColorStop(
    Math.min(0.92, Math.max(0.08, spec.x / 100)),
    `rgba(232,121,249,${0.08 + pose.pulse * 0.16})`,
  )
  glare.addColorStop(1, "rgba(255,255,255,0)")
  ctx.globalCompositeOperation = "screen"
  ctx.fillStyle = glare
  ctx.fillRect(-width / 2, -height / 2, width, height)
  ctx.restore()

  const neon = ctx.createRadialGradient(
    (spec.x / 100) * width,
    (spec.y / 100) * height,
    40,
    width / 2,
    height / 2,
    width * 0.72,
  )
  neon.addColorStop(0, `rgba(168,85,247,${0.1 + pose.pulse * 0.18})`)
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
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/mp4" }))
    }
  })
}

function mountCaptureCanvas(canvas: HTMLCanvasElement) {
  canvas.setAttribute("aria-hidden", "true")
  canvas.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:-1;"
  document.body.appendChild(canvas)
}

function unmountCaptureCanvas(canvas: HTMLCanvasElement) {
  canvas.remove()
}

async function waitAnimationFrame() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function recordWithLiveStream(
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
    videoBitsPerSecond: 8_000_000,
  })
  const chunks: BlobPart[] = []
  const done = waitForRecorder(recorder, chunks)

  drawStoryVideoFrame(ctx, poster, 0)
  await waitAnimationFrame()
  recorder.start(200)

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
  const mime = pickVideoMimeType()
  if (!mime) return { ok: false, reason: "unsupported" }

  const poster = await loadPoster(posterSrc)
  const canvas = document.createElement("canvas")
  canvas.width = STORY_CANVAS_WIDTH
  canvas.height = STORY_CANVAS_HEIGHT
  const ctx = canvas.getContext("2d", { alpha: false })
  if (!ctx) return { ok: false, reason: "failed" }

  mountCaptureCanvas(canvas)
  try {
    const blob = await recordWithLiveStream(canvas, ctx, poster, mime)
    if (!isUsableStoryVideo(blob)) {
      return { ok: false, reason: "too_small" }
    }
    return {
      ok: true,
      blob,
      extension: videoExtensionForMime(blob.type || mime),
    }
  } catch {
    return { ok: false, reason: "failed" }
  } finally {
    unmountCaptureCanvas(canvas)
  }
}
