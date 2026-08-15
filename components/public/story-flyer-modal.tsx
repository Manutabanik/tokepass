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
import { motion } from "motion/react"
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"

import { getStoryCardData } from "@/app/actions/public-story"
import { StoryCanvas } from "@/components/public/story-canvas"
import { Button } from "@/components/ui/button"
import { useLockBodyScroll } from "@/hooks/use-lock-body-scroll"
import { use3DTilt } from "@/hooks/use-3d-tilt"
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
  findStoryTheme,
  type StoryFlyerData,
  type StoryFlyerMode,
  type StoryHeadlineId,
  type StoryThemeId,
} from "@/lib/story-canvas"
import {
  isNativeFileShareAvailable,
  shareOrDownloadPngBlob,
} from "@/lib/story-flyer-share"
import {
  fitStoryPngWeight,
  storyPngOptions,
  waitForStoryFlyerPaint,
} from "@/lib/story-png-export"
import { cn } from "@/lib/utils"

function isStoryDataImage(url?: string | null): boolean {
  return Boolean(url?.trim().startsWith("data:image/"))
}

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
  const storyCardRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [hydrating, setHydrating] = useState(
    () => Boolean(data.imageUrl?.trim()) && !isStoryDataImage(data.imageUrl),
  )
  const [imagesReady, setImagesReady] = useState(() => !data.imageUrl?.trim())
  const [themeId, setThemeId] = useState<StoryThemeId>("neon-purple")
  const [headlineId, setHeadlineId] = useState<StoryHeadlineId>(() =>
    defaultStoryHeadlineId(data.mode),
  )
  const [resolved, setResolved] = useState(data)
  const [dataKey, setDataKey] = useState(
    () => `${data.eventId}-${data.imageUrl}-${data.mode}`,
  )
  const nextDataKey = `${data.eventId}-${data.imageUrl}-${data.mode}`
  if (dataKey !== nextDataKey) {
    setDataKey(nextDataKey)
    setResolved(data)
    setHeadlineId(defaultStoryHeadlineId(data.mode))
    setHydrating(
      Boolean(data.imageUrl?.trim()) && !isStoryDataImage(data.imageUrl),
    )
    setImagesReady(!data.imageUrl?.trim())
  }
  const exportReady = !hydrating && imagesReady && !busy
  const [isZoomed, setIsZoomed] = useState(false)
  const [previewScale, setPreviewScale] = useState(0.22)
  const [zoomScale, setZoomScale] = useState(0.4)
  const zoomRef = useRef<HTMLDivElement>(null)
  const [nativeShare] = useState(() =>
    typeof navigator === "undefined" ? false : isNativeFileShareAvailable(),
  )
  const titleId = useId()
  const tilt = use3DTilt(open && !busy && !isZoomed)

  useLockBodyScroll(open)

  useEffect(() => {
    if (!open) return
    void import("html-to-image")

    if (isStoryDataImage(data.imageUrl) || !data.imageUrl?.trim()) {
      return
    }

    let cancelled = false
    async function hydrate() {
      try {
        const card = await getStoryCardData(data)
        if (cancelled) return
        setResolved(card)
        setHydrating(false)
        if (!isStoryDataImage(card.imageUrl)) setImagesReady(true)
      } catch {
        if (cancelled) return
        setResolved(data)
        setHydrating(false)
        setImagesReady(true)
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [open, data])

  useEffect(() => {
    const node = previewRef.current
    if (!open || !node) return
    const observer = new ResizeObserver(() => {
      setPreviewScale(node.clientWidth / STORY_CANVAS_WIDTH)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [open])

  useEffect(() => {
    const node = zoomRef.current
    if (!isZoomed || !node) return
    const observer = new ResizeObserver(() => {
      setZoomScale(node.clientWidth / STORY_CANVAS_WIDTH)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [isZoomed])

  const waitForImages = useCallback(async (node: HTMLElement) => {
    const images = Array.from(node.querySelectorAll("img"))
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve()
              return
            }
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }),
      ),
    )
  }, [])

  async function captureStoryBlob() {
    const node = storyCardRef.current
    if (!node) return null
    await waitForImages(node)
    await waitForStoryFlyerPaint(node)
    const { toBlob } = await import("html-to-image")
    const options = storyPngOptions(findStoryTheme(themeId).background)
    let blob: Blob | null
    try {
      blob = await toBlob(node, options)
    } catch {
      blob = await toBlob(node, { ...options, skipFonts: true })
    }
    if (!blob) return null
    return fitStoryPngWeight(blob)
  }

  async function handleShareInstagram() {
    if (!exportReady) return
    setBusy(true)
    try {
      const blob = await captureStoryBlob()
      if (!blob) return
      const result = await shareOrDownloadPngBlob(
        blob,
        "tokepass-entrada.png",
      )
      if (result.ok && result.method === "download") {
        toast.success(SAVED_TOAST)
      }
    } catch {
      // Native share cancel or silent download. No error banners.
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadPng() {
    if (!exportReady) return
    setBusy(true)
    try {
      const blob = await captureStoryBlob()
      if (!blob) return
      const result = await shareOrDownloadPngBlob(
        blob,
        "tokepass-entrada.png",
      )
      if (result.ok && result.method === "download") {
        toast.success(SAVED_TOAST)
      }
    } catch {
      // Silent fallback: never surface export errors on mobile.
    } finally {
      setBusy(false)
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setBusy(false)
      setIsZoomed(false)
    }
    onOpenChange(next)
  }

  const chipScroller =
    "flex w-full snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"

  if (!open || typeof window === "undefined") return null

  return createPortal(
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-50 overflow-hidden opacity-0"
      >
        <StoryCanvas
          data={resolved}
          themeId={themeId}
          headlineId={headlineId}
          canvasRef={storyCardRef}
          live={false}
          pauseMotion={busy}
          onPainted={() => setImagesReady(true)}
        />
      </div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogPortal>
        <DialogOverlay className="z-[100] bg-black/90 backdrop-blur-md" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/90 p-4 outline-none backdrop-blur-md sm:p-6"
          aria-labelledby={titleId}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            className="relative my-auto flex w-full max-w-4xl max-h-[90vh] flex-col overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-4 sm:p-6"
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            <div className="mb-4 flex w-full shrink-0 items-center justify-between gap-3">
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

            <div className="flex flex-col items-center gap-4 md:grid md:grid-cols-12 md:items-center md:gap-8">
              <div className="flex w-full justify-center md:col-span-6">
                <button
                  type="button"
                  ref={previewRef}
                  onClick={() => setIsZoomed(true)}
                  className="relative aspect-[9/16] max-h-[45vh] w-[min(calc(45vh*9/16),calc(100vw-3rem),22rem)] cursor-pointer overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 md:max-h-[70vh] md:w-[min(calc(70vh*9/16),28rem)]"
                  style={{
                    willChange: "transform",
                    transform: "translateZ(0)",
                    ...tilt.perspectiveStyle,
                  }}
                  onPointerMove={tilt.onPointerMove}
                  onPointerLeave={tilt.onPointerLeave}
                  onPointerDown={(event) => {
                    if (event.pointerType === "touch") void tilt.enableGyro()
                  }}
                  aria-label="Ampliar vista previa"
                >
                  <div
                    style={{
                      width: STORY_CANVAS_WIDTH,
                      height: STORY_CANVAS_HEIGHT,
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top left",
                      willChange: "transform",
                      pointerEvents: "none",
                    }}
                  >
                    <StoryCanvas
                      data={resolved}
                      themeId={themeId}
                      headlineId={headlineId}
                      live
                      pauseMotion={busy || hydrating || isZoomed}
                      rotateX={tilt.rotateX}
                      rotateY={tilt.rotateY}
                    />
                  </div>
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl mix-blend-screen"
                    style={{ background: tilt.holoBackground }}
                  />
                </button>
              </div>

              <div className="flex w-full flex-col gap-4 md:col-span-6">
                <div className="w-full">
                  <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/50 md:text-left">
                    Tema
                  </p>
                  <div className={chipScroller}>
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
                            "h-9 shrink-0 snap-start rounded-full px-3 text-[11px] font-bold transition",
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

                <div className="w-full">
                  <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/50 md:text-left">
                    Frase
                  </p>
                  <div className={chipScroller}>
                    {STORY_HEADLINES.map((headline) => {
                      const selected = headline.id === headlineId
                      return (
                        <button
                          key={headline.id}
                          type="button"
                          onClick={() => setHeadlineId(headline.id)}
                          aria-pressed={selected}
                          className={cn(
                            "shrink-0 snap-start rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide transition",
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
                  disabled={!exportReady}
                  onClick={() => void handleShareInstagram()}
                  className="min-h-14 w-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-base font-bold text-white hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-400"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                      Generando imagen…
                    </>
                  ) : hydrating || !imagesReady ? (
                    <>
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                      Preparando imagen…
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
                  disabled={!exportReady}
                  variant="outline"
                  onClick={() => void handleDownloadPng()}
                  className="min-h-12 w-full rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
                >
                  <Download className="size-5" aria-hidden />
                  Descargar Imagen PNG
                </Button>
                <p className="text-center text-xs text-zinc-500 md:text-left">
                  {nativeShare
                    ? "PNG Ultra HD 1080 x 1920 para Instagram o WhatsApp."
                    : "PNG Ultra HD 1080 x 1920. Se guarda en el telefono si no puede compartir."}
                </p>
              </div>
            </div>
          </div>
        </DialogPrimitive.Popup>

        {isZoomed ? (
          <div
            className="fixed inset-0 z-[120] flex cursor-zoom-out flex-col items-center justify-center bg-black/95 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Vista previa ampliada"
            onClick={() => setIsZoomed(false)}
          >
            <button
              type="button"
              className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white"
              onClick={() => setIsZoomed(false)}
            >
              <X className="size-4" aria-hidden />
              Cerrar vista previa
            </button>
            <div
              ref={zoomRef}
              className="relative aspect-[9/16] max-h-[78vh] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
              style={{
                width: "min(calc(78vh * 9 / 16), calc(100vw - 2rem))",
              }}
            >
              <div
                style={{
                  width: STORY_CANVAS_WIDTH,
                  height: STORY_CANVAS_HEIGHT,
                  transform: `scale(${zoomScale})`,
                  transformOrigin: "top left",
                  pointerEvents: "none",
                }}
              >
                <StoryCanvas
                  data={resolved}
                  themeId={themeId}
                  headlineId={headlineId}
                  live={false}
                  pauseMotion
                />
              </div>
            </div>
            <p className="mt-3 text-center text-xs font-medium text-white/60">
              Toca en cualquier lugar para volver
            </p>
          </div>
        ) : null}
        </DialogPortal>
      </Dialog>
    </>,
    document.body,
  )
}

type StoryFlyerTriggerProps = {
  data: StoryFlyerData
  label: string
  icon?: ReactNode
  className?: string
  variant?: "primary" | "outline" | "card" | "hero"
}

export function StoryFlyerTrigger({
  data,
  label,
  icon,
  className,
  variant = "primary",
}: StoryFlyerTriggerProps) {
  const [open, setOpen] = useState(false)
  const [card, setCard] = useState<StoryFlyerData | null>(null)
  const [preparing, setPreparing] = useState(false)

  async function handleOpen() {
    if (preparing) return
    setPreparing(true)
    try {
      const hydrated = isStoryDataImage(data.imageUrl)
        ? data
        : await getStoryCardData(data)
      setCard(hydrated)
      setOpen(true)
    } catch {
      setCard(data)
      setOpen(true)
    } finally {
      setPreparing(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={preparing}
        onClick={() => void handleOpen()}
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
          variant === "hero" &&
            "h-14 w-full rounded-2xl bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 text-base font-bold text-white shadow-lg shadow-pink-500/20",
          className,
        )}
      >
        {preparing ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          (icon ?? <Camera className="size-4 shrink-0" aria-hidden />)
        )}
        {preparing ? "Preparando historia…" : label}
      </button>
      {open && card ? (
        <StoryFlyerModal data={card} open={open} onOpenChange={setOpen} />
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
