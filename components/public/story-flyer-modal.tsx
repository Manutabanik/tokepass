"use client"

import { toPng } from "html-to-image"
import {
  Camera,
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
import { shareOrDownloadFlyer, shareRemoteImage } from "@/lib/story-flyer-share"
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
  /** Nombre del comprador (modo buyer). */
  buyerName?: string | null
}

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
  canvasRef: RefObject<HTMLDivElement | null>
}) {
  const isBuyer = data.mode === "buyer"
  const buyerLabel =
    data.buyerName?.trim() || "Un comprador de Tokepass"
  const headline = isBuyer ? "Ya tengo mi entrada" : "Nos vemos ahí"
  const subline = isBuyer
    ? `${buyerLabel} va a asistir`
    : "Voy a asistir"

  return (
    <div
      ref={canvasRef}
      data-story-flyer
      style={{
        width: FLYER_W,
        height: FLYER_H,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#09090b",
        color: "#fafafa",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Fondo blur del banner */}
      {data.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.imageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(36px) saturate(1.15)",
            transform: "scale(1.18)",
            opacity: 0.55,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.35) 35%, rgba(9,9,11,0.92) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 18%, rgba(16,185,129,0.22), transparent 55%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "96px 72px 80px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            opacity: 0.9,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: "rgba(16,185,129,0.18)",
              border: "1px solid rgba(16,185,129,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
              color: "#6ee7b7",
            }}
          >
            T
          </div>
          <span
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#a1a1aa",
            }}
          >
            Tokepass
          </span>
        </div>

        {/* Banner oficial */}
        <div
          style={{
            marginTop: 56,
            borderRadius: 36,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 40px 80px rgba(0,0,0,0.45)",
            background: "#18181b",
            aspectRatio: "16 / 9",
            width: "100%",
            flexShrink: 0,
          }}
        >
          {data.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.imageUrl}
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
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "linear-gradient(135deg, #18181b 0%, #27272a 50%, #0f172a 100%)",
                fontSize: 42,
                fontWeight: 800,
                color: "#71717a",
              }}
            >
              Evento
            </div>
          )}
        </div>

        <h1
          style={{
            marginTop: 56,
            marginBottom: 0,
            fontSize: 64,
            lineHeight: 1.08,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: "#fff",
          }}
        >
          {data.eventTitle}
        </h1>

        <div
          style={{
            marginTop: 36,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            fontSize: 30,
            color: "#d4d4d8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#34d399", fontWeight: 700 }}>Fecha</span>
            <span style={{ textTransform: "capitalize" }}>
              {formatEventDay(data.eventDate)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#34d399", fontWeight: 700 }}>Hora</span>
            <span>{formatEventTime(data.eventDate)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <span style={{ color: "#34d399", fontWeight: 700 }}>Lugar</span>
            <span style={{ lineHeight: 1.35 }}>{data.eventLocation}</span>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            borderRadius: 32,
            padding: "36px 40px",
            background:
              isBuyer
                ? "linear-gradient(135deg, rgba(16,185,129,0.22), rgba(52,211,153,0.08))"
                : "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.12))",
            border: isBuyer
              ? "1px solid rgba(52,211,153,0.35)"
              : "1px solid rgba(167,139,250,0.35)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#fff",
            }}
          >
            {headline}
          </p>
          <p
            style={{
              margin: "14px 0 0",
              fontSize: 32,
              fontWeight: 600,
              color: isBuyer ? "#a7f3d0" : "#e9d5ff",
            }}
          >
            {subline}
          </p>
        </div>

        <p
          style={{
            marginTop: 48,
            textAlign: "center",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "#71717a",
          }}
        >
          Conseguí la tuya en Tokepass.com.ar
        </p>
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

  async function generateAndShare() {
    if (busy) return
    setBusy(true)

    try {
      // Flyer custom del organizador: share directo sin regenerar.
      if (data.customStoryUrl?.trim()) {
        const result = await shareRemoteImage({
          url: data.customStoryUrl.trim(),
          title: data.eventTitle,
          text:
            data.mode === "buyer"
              ? `Ya tengo mi entrada para ${data.eventTitle} en Tokepass`
              : `Voy a ${data.eventTitle} · Tokepass`,
        })
        if (result.ok && result.method === "download") {
          toast.success("Flyer guardado en tu galería. Subilo a tus historias.")
        } else if (!result.ok && !result.cancelled) {
          toast.error(result.error)
        }
        return
      }

      const node = canvasRef.current
      if (!node) {
        toast.error("No se pudo preparar el flyer.")
        return
      }

      await waitForImages(node)
      // Pequeña pausa para que el blur/layout asienten.
      await new Promise((r) => window.setTimeout(r, 80))

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 1,
        width: FLYER_W,
        height: FLYER_H,
        style: {
          transform: "none",
          left: "0",
          top: "0",
        },
      })

      const response = await fetch(dataUrl)
      const blob = await response.blob()

      const result = await shareOrDownloadFlyer({
        blob,
        filename: "flyer-tokepass.png",
        title: data.eventTitle,
        text:
          data.mode === "buyer"
            ? `Ya tengo mi entrada para ${data.eventTitle} en Tokepass`
            : `Voy a ${data.eventTitle} · Tokepass`,
      })

      if (result.ok && result.method === "download") {
        toast.success("Flyer guardado en tu galería. Subilo a tus historias.")
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

  useEffect(() => {
    if (!open) setBusy(false)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                <StoryFlyerCanvas data={data} canvasRef={canvasRef} />
              </div>
            </div>

            <div className="flex w-full max-w-sm flex-col gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => void generateAndShare()}
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
                    Compartir o guardar
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-zinc-500">
                Formato 9:16 listo para Instagram, WhatsApp y Stories.
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
            Subí tu entrada a Historias
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-zinc-400">
            Generamos un flyer 9:16 con tu nombre y el evento. Ideal para
            Instagram o WhatsApp.
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
