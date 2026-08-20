"use client"

import { RefreshCw, ShieldCheck, Wine } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useEffect, useMemo, useState } from "react"

import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getTotpRemainingSeconds, getTotpWindowProgress } from "@/lib/totp-offline"

const DEMO_TICKET_ID = "demo-comercial-tokepass"
const DEMO_TOTP_SECRET = "demo-living-qr-comercial-no-es-una-entrada-real"
const STATIC_QR_PAYLOAD = "ENTRADA-PDF-FIJO-VIP-A-42"
const AVG_BAR_SPEND = 12_000
const DEFAULT_NO_SHOW = 18

type ComparisonId = "truchas" | "internet" | "barra" | "flash" | "rrpp"
type ComparisonFilter = "all" | ComparisonId

type ComparisonPoint = {
  id: ComparisonId
  title: string
  traditional: string
  tokepass: string
}

const COMPARISON_POINTS: ComparisonPoint[] = [
  {
    id: "truchas",
    title: "Entradas truchas y falsificaciones",
    traditional:
      "Te dan un PDF o un QR fijo. Se pasa por WhatsApp, le sacan fotocopia y en la puerta ten\u00e9s 10 personas pele\u00e1ndose por la misma entrada.",
    tokepass:
      "QR Vivo. El c\u00f3digo cambia solo en la pantalla del celu cada 15 segundos. Es imposible sacarle foto, imprimirlo o mandarlo por mensaje.",
  },
  {
    id: "internet",
    title: "Internet en el predio",
    traditional:
      "Si se satura el 4G o se corta el WiFi en el lugar, las lectoras no andan, la entrada se traba y la gente empieza a colar.",
    tokepass:
      "Escaner sin internet. La lista de asistentes se guarda en el telefono del personal de puerta. Sigue validando aunque no haya senal en el predio.",
  },
  {
    id: "barra",
    title: "No-show y barra",
    traditional:
      "El que no va te pide devolucion (sacandote plata de la venta) o deja la entrada tirada, perdiendo vos el consumo en la barra.",
    tokepass:
      "Reventa y transferencia oficial. Si alguien no puede ir, le vende su lugar a otro dentro de la app. El evento se llena igual y la barra no pierde ventas.",
  },
  {
    id: "flash",
    title: "Flash sales",
    traditional:
      "Sale la venta de un evento grande, la pagina se cae, se cobra dos veces la misma tarjeta o se sobresatura el aforo.",
    tokepass:
      "Estructura blindada. El sistema procesa miles de compras al mismo segundo sin caerse, sin cobrar de mas y sin vender un solo lugar sobrante.",
  },
  {
    id: "rrpp",
    title: "RRPP y promotores",
    traditional:
      "Planillas de Excel desordenadas, codigos manuales y discusiones a fin de mes para saber cuanto vendio cada uno.",
    tokepass:
      "Panel de RRPP integrado. Cada promotor tiene su link unico, el sistema cuenta sus ventas en vivo y le calcula la comision automatica sin errores.",
  },
]

const FILTERS: Array<{ id: ComparisonFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "truchas", label: "Entradas truchas" },
  { id: "internet", label: "Internet en predio" },
  { id: "barra", label: "No-show y barra" },
  { id: "flash", label: "Flash sales" },
  { id: "rrpp", label: "RRPP y promotores" },
]

function formatArs(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value)
}

function ComparisonMatrix() {
  const [filter, setFilter] = useState<ComparisonFilter>("all")
  const points = useMemo(
    () =>
      filter === "all"
        ? COMPARISON_POINTS
        : COMPARISON_POINTS.filter((point) => point.id === filter),
    [filter],
  )

  return (
    <section className="space-y-5" aria-labelledby="matriz-comparativa">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
          A. Matriz comparativa
        </p>
        <h3
          id="matriz-comparativa"
          className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl"
        >
          Tiqueteras tradicionales vs TokePass
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Elegi el tema que te estan preguntando. A la izquierda, el modelo de
          siempre. A la derecha, lo que cambia con TokePass.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filtro de temas"
      >
        {FILTERS.map((item) => {
          const active = filter === item.id
          return (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full",
                active
                  ? "bg-violet-600 text-white hover:bg-violet-500"
                  : "border-white/15 bg-transparent text-zinc-300 hover:bg-white/8 hover:text-white",
              )}
            >
              {item.label}
            </Button>
          )
        })}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-white/10 md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Comparacion entre tiqueteras tradicionales y TokePass
          </caption>
          <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.12em] text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Tema</th>
              <th className="px-4 py-3 font-semibold">Tradicionales</th>
              <th className="px-4 py-3 font-semibold">TokePass</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr
                key={point.id}
                className="border-t border-white/8 align-top"
              >
                <th className="px-4 py-4 font-semibold text-white">
                  {point.title}
                </th>
                <td className="px-4 py-4 leading-6 text-zinc-400">
                  {point.traditional}
                </td>
                <td className="bg-emerald-400/8 px-4 py-4 leading-6 text-emerald-50">
                  {point.tokepass}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {points.map((point) => (
          <article
            key={point.id}
            className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4"
          >
            <h4 className="text-sm font-semibold text-white">{point.title}</h4>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Tradicionales
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              {point.traditional}
            </p>
            <div className="mt-3 rounded-xl bg-emerald-400/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                TokePass
              </p>
              <p className="mt-1 text-sm leading-6 text-emerald-50">
                {point.tokepass}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function useTotpCountdown() {
  const [remaining, setRemaining] = useState(() => getTotpRemainingSeconds())
  const [progress, setProgress] = useState(() => getTotpWindowProgress())

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining(getTotpRemainingSeconds())
      setProgress(getTotpWindowProgress())
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  return { remaining, progress }
}

function LivingQrSimulator() {
  const { remaining, progress } = useTotpCountdown()

  return (
    <section className="space-y-5" aria-labelledby="simulador-qr">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
          B. Simulador de Living QR
        </p>
        <h3
          id="simulador-qr"
          className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl"
        >
          15 segundos. Despues, esa captura ya no entra.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          El codigo se reescribe solo en la pantalla del celular. Una foto,
          un PDF o un reenvio quedan viejos antes de llegar a la puerta.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            QR tradicional fijo
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            El mismo dibujo para siempre. Una captura alcanza.
          </p>
          <div className="mt-5 flex justify-center rounded-2xl bg-white p-4">
            <QRCodeSVG
              value={STATIC_QR_PAYLOAD}
              size={168}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#111111"
            />
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-amber-300">
            Este codigo no se renueva nunca.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
              Living QR TokePass
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {remaining}s
            </span>
          </div>
          <p className="mt-2 text-sm text-emerald-50/80">
            Se firma de nuevo cada 15 segundos. La captura queda invalida.
          </p>
          <div className="mx-auto mt-5 w-[min(100%,16rem)] rounded-[1.75rem] border border-white/12 bg-zinc-950 p-3 shadow-[0_20px_50px_-28px_rgba(16,185,129,0.7)]">
            <div className="mb-3 flex justify-center">
              <span className="h-1 w-14 rounded-full bg-white/15" />
            </div>
            <LivingTicketQR
              ticketId={DEMO_TICKET_ID}
              totpSecret={DEMO_TOTP_SECRET}
              size={168}
              variant="scan"
            />
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function OccupancyBar({
  filled,
  total,
  tone,
  label,
}: {
  filled: number
  total: number
  tone: "risk" | "ok"
  label: string
}) {
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-white">{label}</span>
        <span className="tabular-nums text-zinc-400">
          {filled} / {total} ({pct}%)
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={`${label}: ${pct} por ciento`}
      >
        <div
          className={cn(
            "h-full rounded-full",
            tone === "ok" ? "bg-emerald-400" : "bg-amber-400",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function BarRecoverySimulator() {
  const [sold, setSold] = useState(800)
  const [noShowPct, setNoShowPct] = useState(DEFAULT_NO_SHOW)
  const emptySeats = Math.round((sold * noShowPct) / 100)
  const traditionalFilled = Math.max(0, sold - emptySeats)
  const recoveredBar = emptySeats * AVG_BAR_SPEND

  return (
    <section className="space-y-5" aria-labelledby="simulador-barra">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300">
          C. Simulador de recuperacion de barra
        </p>
        <h3
          id="simulador-barra"
          className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl"
        >
          El 18% que no va no tiene que vaciarte la barra.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
          Ejemplo ilustrativo. El no-show promedio ronda el 18%. Con
          transferencia y reventa oficial esos lugares se cubren y el consumo
          de barra no se pierde.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="flex items-center justify-between font-medium text-white">
            Entradas vendidas
            <span className="tabular-nums text-zinc-400">{sold}</span>
          </span>
          <input
            type="range"
            min={200}
            max={2000}
            step={50}
            value={sold}
            onChange={(event) => setSold(Number(event.target.value))}
            className="w-full accent-violet-500"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="flex items-center justify-between font-medium text-white">
            No-show
            <span className="tabular-nums text-zinc-400">{noShowPct}%</span>
          </span>
          <input
            type="range"
            min={8}
            max={30}
            step={1}
            value={noShowPct}
            onChange={(event) => setNoShowPct(Number(event.target.value))}
            className="w-full accent-violet-500"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            Ausentes
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-white">
            {emptySeats}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            Consumo en riesgo
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-amber-300">
            {formatArs(recoveredBar)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-emerald-300">
            Recuperado con TokePass
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums text-emerald-200">
            {formatArs(recoveredBar)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-zinc-950/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Tiquetera tradicional
          </p>
          <h4 className="mt-2 text-lg font-bold text-white">
            Lugares vacios y barra fria
          </h4>
          <div className="mt-4">
            <OccupancyBar
              filled={traditionalFilled}
              total={sold}
              tone="risk"
              label="Gente que llega"
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            {emptySeats} lugares pagados quedan vacios. Te piden devolucion o
            dejan la entrada tirada. La barra pierde ese consumo.
          </p>
        </article>
        <article className="rounded-2xl border border-emerald-400/25 bg-emerald-400/8 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
            TokePass
          </p>
          <h4 className="mt-2 flex items-center gap-2 text-lg font-bold text-white">
            <Wine className="size-4 text-emerald-300" aria-hidden="true" />
            El lugar se cubre adentro de la app
          </h4>
          <div className="mt-4">
            <OccupancyBar
              filled={sold}
              total={sold}
              tone="ok"
              label="Aforo cubierto con reventa"
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-emerald-50/85">
            Esos {emptySeats} lugares se transfieren o revenden en oficial. El
            predio se llena y la barra recupera {formatArs(recoveredBar)} de
            consumo ilustrativo.
          </p>
        </article>
      </div>
    </section>
  )
}

export function CommercialCanvas() {
  return (
    <div className="space-y-12">
      <ComparisonMatrix />
      <LivingQrSimulator />
      <BarRecoverySimulator />
      <p className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Demo ilustrativa. El QR de esta pantalla no es una entrada real y no
          abre ninguna puerta. El consumo de barra usa un ticket medio de
          referencia.
        </span>
      </p>
    </div>
  )
}
