import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
} from "@/lib/story-canvas"
import { specularFromTilt } from "@/lib/story-tilt"

export const STORY_VIDEO_DURATION_MS = 4000
export const STORY_VIDEO_FPS = 30

export type StoryVideoPose = {
  rotateX: number
  rotateY: number
  pulse: number
}

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
    "video/webm;codecs=vp8",
    "video/webm",
  ]
  return types.find((type) => isTypeSupported(type)) ?? null
}

export function videoExtensionForMime(mime: string): "mp4" | "webm" {
  return mime.includes("mp4") ? "mp4" : "webm"
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

type RecorderResult = {
  blob: Blob
  extension: "mp4" | "webm"
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
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }))
    }
  })
}

async function recordWithTrackGenerator(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  poster: CanvasImageSource,
  mime: string,
): Promise<Blob> {
  const Generator = (
    globalThis as unknown as {
      MediaStreamTrackGenerator?: new (init: { kind: "video" }) => MediaStreamTrack & {
        writable: WritableStream<VideoFrame>
      }
    }
  ).MediaStreamTrackGenerator
  if (!Generator || typeof VideoFrame === "undefined") {
    throw new Error("track_generator_unavailable")
  }

  const frameCount = STORY_VIDEO_FPS * (STORY_VIDEO_DURATION_MS / 1000)
  const frameDurationUs = Math.round(1_000_000 / STORY_VIDEO_FPS)
  const generator = new Generator({ kind: "video" })
  const writer = generator.writable.getWriter()
  const stream = new MediaStream([generator])
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 6_000_000,
  })
  const chunks: BlobPart[] = []
  const done = waitForRecorder(recorder, chunks)
  recorder.start()

  for (let index = 0; index < frameCount; index += 1) {
    drawStoryVideoFrame(ctx, poster, index / Math.max(1, frameCount - 1))
    const frame = new VideoFrame(canvas, {
      timestamp: index * frameDurationUs,
      duration: frameDurationUs,
    })
    await writer.write(frame)
    frame.close()
  }

  await writer.close()
  recorder.stop()
  return done
}

async function recordWithCaptureStream(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  poster: CanvasImageSource,
  mime: string,
): Promise<Blob> {
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void
  }
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 6_000_000,
  })
  const chunks: BlobPart[] = []
  const done = waitForRecorder(recorder, chunks)
  const frameCount = STORY_VIDEO_FPS * (STORY_VIDEO_DURATION_MS / 1000)
  recorder.start()

  if (typeof track.requestFrame === "function") {
    for (let index = 0; index < frameCount; index += 1) {
      drawStoryVideoFrame(ctx, poster, index / Math.max(1, frameCount - 1))
      track.requestFrame()
    }
  } else {
    await new Promise<void>((resolve) => {
      const started = performance.now()
      const tick = () => {
        const progress = Math.min(
          1,
          (performance.now() - started) / STORY_VIDEO_DURATION_MS,
        )
        drawStoryVideoFrame(ctx, poster, progress)
        if (progress < 1) {
          requestAnimationFrame(tick)
          return
        }
        resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  await new Promise((resolve) => window.setTimeout(resolve, 32))
  recorder.stop()
  stream.getTracks().forEach((item) => item.stop())
  return done
}

export async function exportStoryVideo(
  posterSrc: string,
): Promise<RecorderResult> {
  const mime = pickVideoMimeType()
  if (!mime) throw new Error("video_unsupported")

  const poster = await loadPoster(posterSrc)
  const canvas = document.createElement("canvas")
  canvas.width = STORY_CANVAS_WIDTH
  canvas.height = STORY_CANVAS_HEIGHT
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })
  if (!ctx) throw new Error("canvas_2d_unavailable")

  let blob: Blob
  try {
    blob = await recordWithTrackGenerator(canvas, ctx, poster, mime)
  } catch {
    blob = await recordWithCaptureStream(canvas, ctx, poster, mime)
  }

  return {
    blob,
    extension: videoExtensionForMime(blob.type || mime),
  }
}
