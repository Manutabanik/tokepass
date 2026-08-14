"use client"

import { toBlob } from "html-to-image"
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
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { toast } from "sonner"

import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Button } from "@/components/ui/button"
import { formatEventDay, formatEventTime } from "@/lib/format"
import { storyImageSrc } from "@/lib/story-image"
import {
  downloadBlob,
  shareOrDownloadFlyer,
} from "@/lib/story-flyer-share"
import { cn } from "@/lib/utils"

export type StoryFlyerMode = "visitor" | "buyer"

export type StoryFlyerData = {
  eventTitle: string
  eventDate: string
  eventLocation: string
  /** Banner / flyer del evento. */
  imageUrl?: string | null
  /** Flyer 9:16 subido por el organizador (se comparte directo). */
  customStoryUrl?: string | null
  mode: StoryFlyerMode
  organizerName?: string | null
  organizerAvatarUrl?: string | null
}

function publicLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() || ""
  if (!trimmed || trimmed.includes("@")) return fallback
  return trimmed
}

function organizerInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "TP"
  )
}

function FlyerIcon({
  path,
  size = 28,
}: {
  path: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={path}
        stroke="#6ee7b7"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const ICON_CALENDAR =
  "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
const ICON_CLOCK = "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z"
const ICON_PIN =
  "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
const ICON_TICKET =
  "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"

type StoryFlyerModalProps = {
  data: StoryFlyerData
  open: boolean
  onOpenChange: (open: boolean) => void
}

const FLYER_W = 1080
const FLYER_H = 1920
const PREVIEW_SCALE = 0.28

function StoryFlyerCanvas({
  data,
  canvasRef,
}: {
  data: StoryFlyerData
  canvasRef?: RefObject<HTMLDivElement | null>
}) {
  const gradientId = `hype-${useId().replace(/:/g, "")}`
  const isBuyer = data.mode === "buyer"
  const organizerName = publicLabel(data.organizerName, "la productora")
  const organizerAvatar = storyImageSrc(data.organizerAvatarUrl)
  const eventImage = storyImageSrc(data.imageUrl)
  const hype = isBuyer ? "¡YO YA TENGO MI ENTRADA!" : "¡NOS VEMOS EN..."

  return (
    <div
      ref={canvasRef}
      data-story-flyer
      style={{
        width: FLYER_W,
        height: FLYER_H,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#050507",
        color: "#fafafa",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {eventImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={eventImage}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            filter: "blur(48px) saturate(1.25)",
            transform: "scale(1.22)",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.42) 38%, rgba(0,0,0,0.78) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 12%, rgba(16,185,129,0.28), transparent 52%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "96px 64px 64px",
          boxSizing: "border-box",
        }}
      >
        <svg
          width="100%"
          height={isBuyer ? 200 : 140}
          viewBox={isBuyer ? "0 0 952 200" : "0 0 952 140"}
          role="img"
          aria-label={hype}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="55%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          {isBuyer ? (
            <>
              <text
                x="476"
                y="82"
                textAnchor="middle"
                fill={`url(#${gradientId})`}
                fontSize="72"
                fontWeight={900}
                fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
              >
                ¡YO YA TENGO
              </text>
              <text
                x="476"
                y="168"
                textAnchor="middle"
                fill={`url(#${gradientId})`}
                fontSize="72"
                fontWeight={900}
                fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
              >
                MI ENTRADA!
              </text>
            </>
          ) : (
            <text
              x="476"
              y="96"
              textAnchor="middle"
              fill={`url(#${gradientId})`}
              fontSize="68"
              fontWeight={900}
              fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
            >
              ¡NOS VEMOS EN...
            </text>
          )}
        </svg>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              borderRadius: 44,
              padding: 36,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.22)",
              boxShadow: "0 0 80px rgba(0,0,0,0.5)",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                borderRadius: 28,
                overflow: "hidden",
                width: "100%",
                height: 420,
                background: "#18181b",
              }}
            >
              {eventImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={eventImage}
                  alt=""
                  crossOrigin="anonymous"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#71717a",
                    fontSize: 36,
                    fontWeight: 800,
                  }}
                >
                  Evento
                </div>
              )}
            </div>

            <h1
              style={{
                margin: "32px 0 0",
                fontSize: 56,
                lineHeight: 1.08,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#fff",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
              }}
            >
              {data.eventTitle}
            </h1>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "rgba(139,92,246,0.35)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 900,
                  color: "#ede9fe",
                }}
              >
                {organizerAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={organizerAvatar}
                    alt=""
                    crossOrigin="anonymous"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <span>{organizerInitials(organizerName)}</span>
                )}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 26,
                  fontWeight: 500,
                  color: "#d4d4d8",
                  lineHeight: 1.3,
                }}
              >
                Presentado por:{" "}
                <span style={{ color: "#fff", fontWeight: 800 }}>
                  {organizerName}
                </span>
              </p>
            </div>

            <div
              style={{
                marginTop: 28,
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 999,
                  padding: "14px 22px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#fff",
                  textTransform: "capitalize",
                }}
              >
                <FlyerIcon path={ICON_CALENDAR} />
                {formatEventDay(data.eventDate)}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 999,
                  padding: "14px 22px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                <FlyerIcon path={ICON_CLOCK} />
                {formatEventTime(data.eventDate)}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 999,
                  padding: "14px 22px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  fontSize: 24,
                  fontWeight: 700,
                  color: "#fff",
                  maxWidth: "100%",
                }}
              >
                <FlyerIcon path={ICON_PIN} />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 620,
                  }}
                >
                  {data.eventLocation}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            borderRadius: 28,
            padding: "28px 32px",
            display: "flex",
            alignItems: "center",
            gap: 22,
            background:
              "linear-gradient(90deg, rgba(16,185,129,0.28), rgba(8,145,178,0.22))",
            border: "1px solid rgba(110,231,183,0.35)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#022c22",
              border: "1px solid rgba(110,231,183,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 900,
              color: "#6ee7b7",
              flexShrink: 0,
            }}
          >
            T
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <FlyerIcon path={ICON_TICKET} size={32} />
              <p
                style={{
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 800,
                  color: "#fff",
                  letterSpacing: "-0.02em",
                }}
              >
                ¡Conseguí la tuya en tokepass.com.ar!
              </p>
            </div>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 22,
                fontWeight: 600,
                color: "#a7f3d0",
              }}
            >
              Tokepass
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function StoryFlyerModal({
  data,
  open,
  onOpenChange,
}: StoryFlyerModalProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const titleId = useId()

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
          // CORS bloqueado: intentamos capturar igual
        }
      }),
    )
  }, [])

  async function captureFlyerBlob() {
    const node = canvasRef.current
    if (!node) return null
    await waitForImages(node)
    await new Promise((r) => window.setTimeout(r, 80))
    return toBlob(node, {
      cacheBust: true,
      pixelRatio: 1,
      width: FLYER_W,
      height: FLYER_H,
      skipAutoScale: true,
      skipFonts: true,
      style: {
        transform: "none",
        left: "0",
        top: "0",
      },
    })
  }

  async function generateAndShare(intent: "share" | "download") {
    if (busy) return
    setBusy(true)

    try {
      const blob = await captureFlyerBlob()
      if (!blob) {
        toast.error("No se pudo generar el flyer.")
        return
      }

      if (intent === "download") {
        downloadBlob(blob, "flyer-tokepass.png")
        toast.success("Flyer guardado. Subilo a tus historias.")
        return
      }

      const result = await shareOrDownloadFlyer({
        blob,
        filename: "flyer-tokepass.png",
        title: data.eventTitle,
        text:
          data.mode === "buyer"
            ? `¡Yo ya tengo mi entrada para ${data.eventTitle}! Conseguí la tuya en tokepass.com.ar`
            : `¡Nos vemos en ${data.eventTitle}! Conseguí la tuya en tokepass.com.ar`,
      })

      if (result.ok && result.method === "download") {
        toast.success("Flyer guardado. Subilo a tus historias de Instagram.")
      } else if (!result.ok && !result.cancelled) {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo generar el flyer.",
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
        <DialogOverlay className="bg-black/90 supports-backdrop-filter:backdrop-blur-sm" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex h-dvh w-screen flex-col outline-none">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <DialogTitle
              id={titleId}
              className="text-sm font-semibold text-white"
            >
              Flyer para Historias
            </DialogTitle>
            <DialogClose
              className="grid size-10 place-items-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </DialogClose>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-auto px-4 pb-8">
            {open ? (
              <div
                aria-hidden
                className="pointer-events-none fixed"
                style={{
                  left: -12000,
                  top: 0,
                  width: FLYER_W,
                  height: FLYER_H,
                  overflow: "hidden",
                }}
              >
                <StoryFlyerCanvas data={data} canvasRef={canvasRef} />
              </div>
            ) : null}
            <div
              className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
              style={{
                width: FLYER_W * PREVIEW_SCALE,
                height: FLYER_H * PREVIEW_SCALE,
              }}
            >
              <div
                style={{
                  transform: `scale(${PREVIEW_SCALE})`,
                  transformOrigin: "top left",
                }}
              >
                <StoryFlyerCanvas data={data} />
              </div>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void generateAndShare("share")}
                className="min-h-12 w-full rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 text-base font-bold text-white hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-400"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                    Generando flyer…
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
                onClick={() => void generateAndShare("download")}
                className="min-h-12 w-full rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                <Download className="size-5" aria-hidden />
                Descargar flyer
              </Button>
              <p className="text-center text-xs text-zinc-500">
                9:16 para Historias. Sin tus datos personales.
              </p>
            </div>
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
      <StoryFlyerModal data={data} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** Tarjeta destacada post-compra. */
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
            Flyer 9:16 para Historias: tu hype, el evento y la productora. Sin
            mail, DNI ni QR.
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

/** Botón compacto para billetera / detalle. */
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
      label="Generar Flyer para Historias"
      icon={<Camera className="size-4 shrink-0" aria-hidden />}
      variant="outline"
      className={cn("w-full rounded-2xl", className)}
    />
  )
}

/** CTA visitante en ficha de evento. */
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
