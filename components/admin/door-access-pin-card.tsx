"use client"

import { useEffect, useState, useTransition } from "react"
import {
  Copy,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Share2,
  ShieldOff,
} from "lucide-react"
import { toast } from "sonner"

import {
  generateEventDoorAccessPin,
  getEventDoorAccessPinStatus,
  revokeEventDoorAccessPin,
  type DoorAccessPinStatus,
} from "@/app/actions/door-access"
import { Button } from "@/components/ui/button"
import { doorAccessWhatsAppUrl } from "@/lib/scanner/door-whatsapp"

function formatExpiry(iso: string | null): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return ""
  }
}

export function DoorAccessPinCard({
  eventId,
  eventTitle,
}: {
  eventId: string
  eventTitle?: string
}) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<DoorAccessPinStatus | null>(null)
  const [revealedPin, setRevealedPin] = useState<string | null>(null)
  const doorUrl =
    (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "") + "/puerta"

  useEffect(() => {
    let cancelled = false
    void getEventDoorAccessPinStatus(eventId).then((next) => {
      if (!cancelled) setStatus(next)
    })
    return () => {
      cancelled = true
    }
  }, [eventId])

  function refreshStatus() {
    void getEventDoorAccessPinStatus(eventId).then(setStatus)
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-200">
          <KeyRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-foreground">
            PIN de Control de Acceso
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {eventTitle
              ? `Codigo de 6 digitos para ${eventTitle}. `
              : "Codigo de 6 digitos. "}
            Vale 24 horas. El staff entra en{" "}
            <span className="font-medium text-foreground">/puerta</span> sin
            email ni contraseña.
          </p>
        </div>
      </div>

      {revealedPin ? (
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-5 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-200">
            Mostralo una sola vez
          </p>
          <p className="mt-2 font-mono text-4xl font-black tracking-[0.28em] text-foreground">
            {revealedPin}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vence {formatExpiry(status?.expiresAt ?? null) || "en 24 horas"}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(revealedPin)
                toast.success("PIN copiado")
              }}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copiar PIN
            </Button>
            <Button
              type="button"
              onClick={() => {
                window.open(
                  doorAccessWhatsAppUrl({
                    eventTitle: eventTitle ?? "el evento",
                    pin: revealedPin,
                  }),
                  "_blank",
                  "noopener,noreferrer",
                )
              }}
            >
              <Share2 className="size-4" aria-hidden="true" />
              Enviar acceso por WhatsApp
            </Button>
          </div>
        </div>
      ) : status?.active ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Hay un PIN activo hasta {formatExpiry(status.expiresAt)}. No se puede
          volver a leer: si se perdio, genera uno nuevo.
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Todavia no hay un PIN vigente para este evento.
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || !eventId}
          onClick={() => {
            startTransition(async () => {
              const result = await generateEventDoorAccessPin(eventId)
              if (!result.success) {
                toast.error(result.error)
                return
              }
              setRevealedPin(result.pin)
              refreshStatus()
              toast.success("PIN de puerta generado")
            })
          }}
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          {status?.active
            ? "Generar PIN de Control de Acceso"
            : "Generar PIN de Control de Acceso"}
        </Button>
        {status?.active ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const result = await revokeEventDoorAccessPin(eventId)
                if (!result.success) {
                  toast.error(result.error)
                  return
                }
                setRevealedPin(null)
                refreshStatus()
                toast.success("PIN revocado")
              })
            }}
          >
            <ShieldOff className="size-4" aria-hidden="true" />
            Revocar PIN
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Entrada del staff: {doorUrl.startsWith("http") ? doorUrl : "/puerta"}
      </p>
    </section>
  )
}
