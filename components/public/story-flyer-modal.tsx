"use client"

import {
  Camera,
  Download,
  ImagePlus,
  Loader2,
  PartyPopper,
  Share2,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { getPublicStoryHeadliner } from "@/app/actions/public-story"
import { StoryCanvas } from "@/components/public/story-canvas"
import { Button } from "@/components/ui/button"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import { useStoryTilt } from "@/hooks/use-story-tilt"
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  STORY_HEADLINES,
  STORY_THEMES,
  defaultStoryHeadlineId,
  type StoryFlyerData,
  type StoryFlyerMode,
  type StoryHeadlineId,
  type StoryThemeId,
} from "@/lib/story-canvas"
import {
  downloadImageBlob,
  isNativeFileShareAvailable,
} from "@/lib/story-flyer-share"
import { hydrateStoryFlyerImages } from "@/lib/story-image"
import { cn } from "@/lib/utils"

export type { StoryFlyerData, StoryFlyerMode }

type StoryFlyerModalProps = {
  data: StoryFlyerData
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SAVED_TOAST =
  "Imagen guardada. Abri Instagram para subirla a tus Historias"

export function StoryFlyerModal({
  data,
  open,
  onOpenChange,
}: StoryFlyerModalProps) {
  const captureRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [hydrating, setHydrating] = useState(false)
  const [themeId, setThemeId] = useState<StoryThemeId>("neon-purple")
  const [headlineId, setHeadlineId] = useState<StoryHeadlineId>(() =>
    defaultStoryHeadlineId(data.mode),
  )
  const [resolved, setResolved] = useState(data)
  const [previewScale, setPreviewScale] = useState(0.22)
  const [nativeShare, setNativeShare] = useState(false)
  const titleId = useId()
  const tilt = useStoryTilt(open && !busy)

  useLockBodyScroll(open)

  useEffect(() => {
    setResolved(data)
    setHeadlineId(defaultStoryHeadlineId(data.mode))
  }, [data])

  useEffect(() => {
    setNativeShare(isNativeFileShareAvailable())
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setHydrating(true)

    async function hydrate() {
      let next = data
      if (!data.artistName?.trim() && data.eventId?.trim()) {
        const artist = await getPublicStoryHeadliner(data.eventId.trim())
        if (artist) {
          next = {
            ...next,
            artistName: next.artistName || artist.name,
            artistImageUrl: next.artistImageUrl || artist.imageUrl,
          }
        }
      }
      const hydrated = await hydrateStoryFlyerImages(next)
      if (cancelled) return
      setResolved(hydrated)
      setHydrating(false)
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [open, data])

  useEffect(() => {
    const node = previewRef.current
    if (!open || !node) return
    const update = () => {
      setPreviewScale(node.clientWidth / STORY_CANVAS_WIDTH)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [open])

  const waitForImages = useCallback(async (node: HTMLElement) => {
    const images = Array.from(node.querySelectorAll("img"))
    await Promise.all(
      images.map(async (img) => {
        const src = img.getAttribute("src")
        if (!src || src.startsWith("data:")) {
          if (img.complete) return
          await new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          })
          return
        }
        try {
          const response = await fetch(src, { mode: "cors", cache: "no-store" })
          if (!response.ok) return
          const blob = await response.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          img.src = dataUrl
          await new Promise<void>((resolve) => {
            if (img.complete) {
              resolve()
              return
            }
            img.onload = () => resolve()
            img.onerror = () => resolve()
          })
        } catch {
          // Same-origin proxy already applied; capture anyway.
        }
      }),
    )
  }, [])

  async function captureFlyerBlob() {
    const node = captureRef.current
    if (!node) return null
    await waitForImages(node)
    await new Promise((r) => window.setTimeout(r, 80))
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    const { toBlob } = await import("html-to-image")
    const options = {
      cacheBust: true,
      pixelRatio: 1,
      width: STORY_CANVAS_WIDTH,
      height: STORY_CANVAS_HEIGHT,
      skipAutoScale: true,
      includeQueryParams: true,
      filter: (element: HTMLElement) =>
        !element.closest("[data-story-actions]"),
      style: {
        transform: "none",
        left: "0",
        top: "0",
      },
    } as const
    try {
      return await toBlob(node, {
        ...options,
        skipFonts: false,
        preferredFontFormat: "woff2",
      })
    } catch {
      return toBlob(node, { ...options, skipFonts: true })
    }
  }

  async function handleShareToInstagram() {
    if (busy) return
    setBusy(true)
    await new Promise((r) => window.setTimeout(r, 140))

    try {
      const blob = await captureFlyerBlob()
      if (!blob) {
        toast.error("No se pudo generar la historia.")
        return
      }

      const file = new File([blob], "historia-tokepass.png", {
        type: blob.type || "image/png",
      })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Mi Entrada Tokepass",
            text: "Ya tengo mi entrada!",
          })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return
          }
          downloadImageBlob(blob)
          toast.success(SAVED_TOAST)
          return
        }
      }

      downloadImageBlob(blob)
      toast.success(SAVED_TOAST)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo generar la historia.",
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadImage() {
    if (busy) return
    setBusy(true)
    await new Promise((r) => window.setTimeout(r, 140))

    try {
      const blob = await captureFlyerBlob()
      if (!blob) {
        toast.error("No se pudo generar la historia.")
        return
      }
      downloadImageBlob(blob)
      toast.success(SAVED_TOAST)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo generar la historia.",
      )
    } finally {
      setBusy(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) setBusy(false)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[100] bg-black/90 backdrop-blur-lg" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-black/90 p-4 outline-none backdrop-blur-lg"
          aria-labelledby={titleId}
        >
          <div className="flex w-full max-w-sm items-center justify-between gap-3 pb-3">
            <DialogTitle
              id={titleId}
              className="text-sm font-semibold text-white"
            >
              Compartir en Historias
            </DialogTitle>
            <DialogClose
              className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </DialogClose>
          </div>

          {open ? (
            <div
              aria-hidden
              className="pointer-events-none fixed"
              style={{
                left: -12000,
                top: 0,
                width: STORY_CANVAS_WIDTH,
                height: STORY_CANVAS_HEIGHT,
                overflow: "hidden",
              }}
            >
              <StoryCanvas
                data={resolved}
                themeId={themeId}
                headlineId={headlineId}
                canvasRef={captureRef}
                live={false}
                pauseMotion={busy}
              />
            </div>
          ) : null}

          <div
            ref={previewRef}
            className="relative aspect-[9/16] max-h-[60vh] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
            style={{
              width: "min(calc(60vh * 9 / 16), calc(100vw - 2rem))",
              willChange: "transform",
              transform: "translateZ(0)",
              touchAction: "none",
            }}
            onPointerMove={tilt.onPointerMove}
            onPointerLeave={tilt.onPointerLeave}
            onPointerDown={(event) => {
              if (event.pointerType === "touch") void tilt.enableGyro()
            }}
          >
            <div
              style={{
                width: STORY_CANVAS_WIDTH,
                height: STORY_CANVAS_HEIGHT,
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
                willChange: "transform",
              }}
            >
              <StoryCanvas
                data={resolved}
                themeId={themeId}
                headlineId={headlineId}
                live
                pauseMotion={busy || hydrating}
                rotateX={tilt.rotateX}
                rotateY={tilt.rotateY}
              />
            </div>
          </div>

          <div
            data-story-actions
            className="mt-4 flex w-full max-w-sm flex-col gap-3"
          >
            <div>
              <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                Tema
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STORY_THEMES.map((theme) => {
                  const selected = theme.id === themeId
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeId(theme.id)}
                      aria-pressed={selected}
                      title={theme.label}
                      className={cn(
                        "h-9 rounded-full px-3 text-[11px] font-bold transition",
                        selected
                          ? "bg-white text-zinc-950"
                          : "border border-white/15 bg-white/8 text-white/80 hover:bg-white/15",
                      )}
                    >
                      {theme.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                Frase
              </p>
              <div className="flex justify-center gap-2 overflow-x-auto pb-1">
                {STORY_HEADLINES.map((headline) => {
                  const selected = headline.id === headlineId
                  return (
                    <button
                      key={headline.id}
                      type="button"
                      onClick={() => setHeadlineId(headline.id)}
                      aria-pressed={selected}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide transition",
                        selected
                          ? "bg-white text-zinc-950"
                          : "border border-white/15 bg-white/8 text-white/80 hover:bg-white/15",
                      )}
                    >
                      {headline.lines.join(" ")}
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              type="button"
              disabled={busy}
              onClick={() => void handleShareToInstagram()}
              className="min-h-12 w-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-base font-bold text-white hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-400"
            >
              {busy ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  Generando historia…
                </>
              ) : (
                <>
                  <Share2 className="size-5" aria-hidden />
                  Compartir en Instagram
                </>
              )}
            </Button>
            <Button
              type="button"
              disabled={busy}
              variant="outline"
              onClick={() => void handleDownloadImage()}
              className="min-h-12 w-full rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              <Download className="size-5" aria-hidden />
              Descargar Imagen 9:16
            </Button>
            <p className="text-center text-xs text-zinc-500">
              {nativeShare
                ? "1080 x 1920. Sin tus datos personales."
                : "1080 x 1920. Se guarda en Descargas si el telefono no comparte archivos."}
            </p>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}

type StoryFlyerTriggerProps = {
  data: StoryFlyerData
  label: string
  icon?: ReactNode
  className?: string
  variant?: "primary" | "outline" | "card"
}

export function StoryFlyerTrigger({
  data,
  label,
  icon,
  className,
  variant = "primary",
}: StoryFlyerTriggerProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variant === "primary" &&
            "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-white shadow-lg shadow-fuchsia-500/20 hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-400",
          variant === "outline" &&
            "border border-border bg-card text-foreground hover:bg-muted",
          variant === "card" &&
            "w-full border border-fuchsia-500/30 bg-gradient-to-br from-violet-600/20 via-fuchsia-600/15 to-pink-500/10 text-foreground hover:border-fuchsia-400/50",
          className,
        )}
      >
        {icon ?? <Camera className="size-4 shrink-0" aria-hidden />}
        {label}
      </button>
      {open ? (
        <StoryFlyerModal data={data} open={open} onOpenChange={setOpen} />
      ) : null}
    </>
  )
}

export function StoryFlyerSuccessCard({ data }: { data: StoryFlyerData }) {
  return (
    <div className="w-full rounded-3xl border border-fuchsia-500/30 bg-gradient-to-br from-violet-600/15 via-fuchsia-600/10 to-pink-500/10 p-5 text-left ring-1 ring-white/5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/30">
          <PartyPopper className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-200/90">
            Contalo en Historias
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-white">
            Presumí que vas al evento
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-zinc-400">
            Historia 9:16 estilo Wrapped: elegí fondo, frase y compartí.
          </p>
          <StoryFlyerTrigger
            data={data}
            label="Subir mi entrada a Historias"
            icon={<ImagePlus className="size-4 shrink-0" aria-hidden />}
            variant="primary"
            className="mt-4 w-full rounded-full"
          />
        </div>
      </div>
    </div>
  )
}

export function StoryFlyerWalletButton({
  data,
  className,
}: {
  data: StoryFlyerData
  className?: string
}) {
  return (
    <StoryFlyerTrigger
      data={data}
      label="Compartir en Historias"
      icon={<Camera className="size-4 shrink-0" aria-hidden />}
      variant="outline"
      className={cn("w-full rounded-2xl", className)}
    />
  )
}

export function StoryFlyerVisitorButton({
  data,
  className,
}: {
  data: StoryFlyerData
  className?: string
}) {
  return (
    <StoryFlyerTrigger
      data={data}
      label="Compartir en Historias"
      icon={<Camera className="size-4 shrink-0" aria-hidden />}
      variant="outline"
      className={className}
    />
  )
}
