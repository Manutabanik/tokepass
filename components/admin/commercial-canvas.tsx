"use client"

import {
  BarChart3,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
  WifiOff,
  Wine,
  Zap,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useMemo, useState } from "react"

import { LivingTicketQR } from "@/components/public/living-ticket-qr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const DEMO_TICKET_ID = "demo-comercial-tokepass"
const DEMO_TOTP_SECRET = "demo-living-qr-comercial-no-es-una-entrada-real"
const STATIC_QR_PAYLOAD = "ENTRADA-PDF-FIJO-VIP-A-42"

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
      "Te dan un PDF o un QR fijo. Se pasa por WhatsApp, le sacan fotocopia y en la puerta tenés 10 personas peleándose por la misma entrada.",
    tokepass:
      "QR Vivo. El código cambia solo en la pantalla del celu cada 15 segundos. Es imposible sacarle foto, imprimirlo o mandarlo por mensaje.",
  },
  {
    id: "internet",
    title: "Caídas de internet en el predio",
    traditional:
      "Si se satura el 4G o se corta el WiFi en el lugar, las lectoras no andan, la entrada se traba y la gente empieza a colar.",
    tokepass:
      "Escáner sin internet. La lista de asistentes se guarda en el teléfono del personal de puerta. Sigue validando aunque no haya señal en el predio.",
  },
  {
    id: "barra",
    title: "Gente que no va y barra vacía",
    traditional:
      "El que no va te pide devolución (sacándote plata de la venta) o deja la entrada tirada, perdiendo vos el consumo en la barra.",
    tokepass:
      "Reventa y transferencia oficial. Si alguien no puede ir, le vende su lugar a otro dentro de la app. El evento se llena igual y la barra no pierde ventas.",
  },
  {
    id: "flash",
    title: "Caídas en lanzamientos de entradas (Flash Sales)",
    traditional:
      "Sale la venta de un evento grande, la página se cae, se cobra dos veces la misma tarjeta o se sobresatura el aforo.",
    tokepass:
      "Estructura blindada. El sistema procesa miles de compras al mismo segundo sin caerse, sin cobrar de más y sin vender un solo lugar sobrante.",
  },
  {
    id: "rrpp",
    title: "Descontrol con los RRPP y promotores",
    traditional:
      "Planillas de Excel desordenadas, códigos manuales y discusiones a fin de mes para saber cuánto vendió cada uno.",
    tokepass:
      "Panel de RRPP integrado. Cada promotor tiene su link único, el sistema cuenta sus ventas en vivo y le calcula la comisión automática sin errores.",
  },
]

const FILTERS: Array<{ id: ComparisonFilter; label: string }> = [
  { id: "all", label: "Los 5 puntos" },
  { id: "truchas", label: "Entradas truchas" },
  { id: "internet", label: "Internet en predio" },
  { id: "barra", label: "Barra y no-show" },
  { id: "flash", label: "Flash sale" },
  { id: "rrpp", label: "RRPP" },
]

const PILLARS = [
  {
    title: "Tu caja es intocable",
    body: "El pozo del show no se descalza porque alguien se arrepintió a último momento. En vez de devolverte el problema a vos, TokePass mueve el lugar por reventa o transferencia oficial. La plata de las entradas vendidas sigue en tu recaudación y no se evapora en reintegros improvisados.",
    icon: Wallet,
  },
  {
    title: "Evento lleno = Barra llena",
    body: "El que compró y no puede ir no deja un hueco muerto en el predio. Pasa su lugar a otra persona dentro de la app. Vos no perdés aforo, la barra sigue vendiendo y el show se siente lleno de verdad, no con butacas vacías de gente que pagó y se quedó en casa.",
    icon: Wine,
  },
  {
    title: "Cero líos en el ingreso",
    body: "Policía y seguridad no se pelean con diez celus mostrando la misma captura. El QR Vivo solo sirve en la pantalla del dueño, se renueva solo y el escáner de puerta lo valida aunque no haya señal. Menos filas, menos discusiones, menos gente colada.",
    icon: ShieldCheck,
  },
  {
    title: "Métricas en vivo",
    body: "Desde el celu ves el ritmo de ingreso en la puerta, cuánto está facturando cada RRPP y el total cobrado en tiempo real. No esperás al día después ni armás un Excel a las 4 de la mañana: el control del show lo tenés mientras está pasando.",
    icon: BarChart3,
  },
] as const

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
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {filled} / {total} ({pct}%)
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"
        role="img"
        aria-label={`${label}: ${pct} por ciento`}
      >
        <div
          className={cn(
            "h-full rounded-full",
            tone === "ok" ? "bg-emerald-500" : "bg-amber-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function NightSimulator() {
  const [sold, setSold] = useState(800)
  const [noShowPct, setNoShowPct] = useState(18)
  const emptySeats = Math.round((sold * noShowPct) / 100)
  const traditionalFilled = Math.max(0, sold - emptySeats)

  return (
    <section className="space-y-5" aria-labelledby="simulador-noche">
      <div>
        <h2
          id="simulador-noche"
          className="text-xl font-black tracking-[-0.03em] text-foreground"
        >
          Simulador de una noche
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Ejemplo ilustrativo para armar la conversación. No es una proyección
          de tu evento: mové los controles y mirá cómo se parte el aforo si
          la gente no va y no hay reventa oficial.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="flex items-center justify-between font-medium text-foreground">
            Entradas vendidas
            <span className="tabular-nums text-muted-foreground">{sold}</span>
          </span>
          <input
            type="range"
            min={200}
            max={2000}
            step={50}
            value={sold}
            onChange={(event) => setSold(Number(event.target.value))}
            className="w-full accent-violet-600"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="flex items-center justify-between font-medium text-foreground">
            Porcentaje que no puede ir
            <span className="tabular-nums text-muted-foreground">{noShowPct}%</span>
          </span>
          <input
            type="range"
            min={5}
            max={35}
            step={1}
            value={noShowPct}
            onChange={(event) => setNoShowPct(Number(event.target.value))}
            className="w-full accent-violet-600"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]">
          <CardHeader className="pb-3">
            <CardDescription>Tiquetera tradicional</CardDescription>
            <CardTitle className="text-lg">Lugares vacíos y barra fría</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <OccupancyBar
              filled={traditionalFilled}
              total={sold}
              tone="risk"
              label="Gente que llega"
            />
            <p className="text-sm leading-6 text-muted-foreground">
              {emptySeats} lugares pagados quedan vacíos. Te piden devolución o
              dejan la entrada tirada. La barra pierde ese consumo y en la
              puerta igual podés tener lío si alguien reenvió el PDF.
            </p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/25 bg-emerald-500/5 dark:bg-emerald-400/8">
          <CardHeader className="pb-3">
            <CardDescription>TokePass</CardDescription>
            <CardTitle className="text-lg">El lugar se cubre adentro de la app</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <OccupancyBar
              filled={sold}
              total={sold}
              tone="ok"
              label="Aforo cubierto con reventa"
            />
            <p className="text-sm leading-6 text-muted-foreground">
              Esos {emptySeats} lugares se pueden pasar o revender en oficial.
              El evento se llena igual, la barra no pierde la noche y el QR
              Vivo corta las copias que antes te armaban fila de reclamo.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function QrDemo() {
  return (
    <section className="space-y-5" aria-labelledby="demo-qr">
      <div>
        <h2
          id="demo-qr"
          className="text-xl font-black tracking-[-0.03em] text-foreground"
        >
          Demo en pantalla: QR fijo vs QR Vivo
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Alterná las vistas. El QR tradicional es el PDF de siempre. El de
          TokePass usa el mismo mecanismo de la entrada real: se firma de
          nuevo cada 15 segundos y una captura ya no sirve.
        </p>
      </div>

      <Tabs defaultValue="living" className="gap-4">
        <TabsList
          aria-label="Tipo de QR"
          className="h-auto w-full flex-wrap justify-start gap-1 bg-muted p-1 sm:w-auto"
        >
          <TabsTrigger value="traditional" className="h-8 px-3">
            QR tradicional fijo
          </TabsTrigger>
          <TabsTrigger value="living" className="h-8 px-3">
            Living QR TokePass
          </TabsTrigger>
          <TabsTrigger value="compare" className="h-8 px-3">
            Comparar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="traditional">
          <QrPanel mode="traditional" />
        </TabsContent>
        <TabsContent value="living">
          <QrPanel mode="living" />
        </TabsContent>
        <TabsContent value="compare">
          <div className="grid gap-4 lg:grid-cols-2">
            <QrPanel mode="traditional" compact />
            <QrPanel mode="living" compact />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

function QrPanel({
  mode,
  compact = false,
}: {
  mode: "traditional" | "living"
  compact?: boolean
}) {
  const isLiving = mode === "living"

  return (
    <Card
      className={cn(
        "border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]",
        isLiving && "border-emerald-500/25 dark:border-emerald-400/20",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isLiving ? "default" : "outline"}>
            {isLiving ? "Protegido" : "Inseguro"}
          </Badge>
          <CardDescription>
            {isLiving ? "Living QR de TokePass" : "QR tradicional fijo"}
          </CardDescription>
        </div>
        <CardTitle className="text-lg">
          {isLiving
            ? "Cambia solo en el celu cada 15 segundos"
            : "Una foto o un PDF alcanza para colar"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="mx-auto w-full max-w-[240px] rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-950">
          {isLiving ? (
            <LivingTicketQR
              ticketId={DEMO_TICKET_ID}
              totpSecret={DEMO_TOTP_SECRET}
              size={compact ? 176 : 200}
              variant="scan"
            />
          ) : (
            <div className="space-y-3 text-center">
              <QRCodeSVG
                value={STATIC_QR_PAYLOAD}
                size={compact ? 176 : 200}
                level="M"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#111111"
                className="mx-auto bg-white"
              />
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Este código no se renueva nunca.
              </p>
            </div>
          )}
        </div>
        <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
          {isLiving ? (
            <>
              <li>El patrón del QR se reescribe solo. Una captura queda vieja en segundos.</li>
              <li>No se puede reenviar por WhatsApp ni imprimir para que entre otro.</li>
              <li>
                En la puerta el personal lo lee aunque el predio se quede sin
                señal: la validación viaja en el teléfono.
              </li>
            </>
          ) : (
            <>
              <li>Es el mismo dibujo para siempre: PDF, mail o captura sirven igual.</li>
              <li>Si lo mandan por WhatsApp, en la fila aparecen varios con la misma entrada.</li>
              <li>Seguridad y policía terminan discutiendo quién es el dueño real.</li>
            </>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}

export function CommercialCanvas() {
  const [filter, setFilter] = useState<ComparisonFilter>("all")
  const points = useMemo(
    () =>
      filter === "all"
        ? COMPARISON_POINTS
        : COMPARISON_POINTS.filter((point) => point.id === filter),
    [filter],
  )

  return (
    <div className="mx-auto max-w-6xl space-y-12">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">
          Canvas comercial
        </p>
        <h1 className="text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
          TokePass — La tiquetera pensada para el productor de eventos.
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          Cero entradas truchas, la puerta fluye sin internet, cuidamos tu
          recaudación y tenés el control total de tus RRPP desde el celular.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">QR Vivo 15s</Badge>
          <Badge variant="secondary">Escáner offline</Badge>
          <Badge variant="secondary">Reventa oficial</Badge>
          <Badge variant="secondary">RRPP con link único</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ShieldCheck, label: "Cero entradas truchas" },
            { icon: WifiOff, label: "Puerta sin internet" },
            { icon: Users, label: "RRPP desde el celu" },
            { icon: Zap, label: "Lanzamientos sin caída" },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-foreground dark:border-white/8 dark:bg-white/[0.03]"
              >
                <Icon className="size-4 text-violet-500" aria-hidden="true" />
                {item.label}
              </div>
            )
          })}
        </div>
      </header>

      <section className="space-y-5" aria-labelledby="matriz-comparativa">
        <div>
          <h2
            id="matriz-comparativa"
            className="text-xl font-black tracking-[-0.03em] text-foreground"
          >
            Tiqueteras tradicionales vs TokePass
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Filtrá el punto que te están preguntando en la reunión. A la
            izquierda, Passline, Eventbrite o Ticketek. A la derecha, lo que
            cambia cuando el productor labura con TokePass.
          </p>
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filtro de la matriz"
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
              >
                {item.label}
              </Button>
            )
          })}
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-zinc-200 dark:border-white/8 md:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Comparación de cinco puntos entre tiqueteras tradicionales y
              TokePass
            </caption>
            <thead className="bg-zinc-50 text-xs uppercase tracking-[0.08em] text-muted-foreground dark:bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3 font-semibold">Punto</th>
                <th className="px-4 py-3 font-semibold">Tradicionales</th>
                <th className="px-4 py-3 font-semibold">TokePass</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr
                  key={point.id}
                  className="border-t border-zinc-200 align-top dark:border-white/8"
                >
                  <th className="px-4 py-4 font-semibold text-foreground">
                    {point.title}
                  </th>
                  <td className="px-4 py-4 leading-6 text-muted-foreground">
                    {point.traditional}
                  </td>
                  <td className="bg-emerald-500/5 px-4 py-4 leading-6 text-foreground dark:bg-emerald-400/8">
                    {point.tokepass}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {points.map((point) => (
            <Card
              key={point.id}
              className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{point.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Tradicionales
                  </p>
                  <p className="mt-1 text-muted-foreground">{point.traditional}</p>
                </div>
                <div className="rounded-lg bg-emerald-500/5 p-3 dark:bg-emerald-400/8">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                    TokePass
                  </p>
                  <p className="mt-1 text-foreground">{point.tokepass}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="pilares-venta">
        <h2
          id="pilares-venta"
          className="text-xl font-black tracking-[-0.03em] text-foreground"
        >
          Los 4 pilares para cerrar la conversación
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon
            return (
              <Card
                key={pillar.title}
                className="border-zinc-200 bg-white dark:border-white/8 dark:bg-white/[0.03]"
              >
                <CardHeader className="pb-2">
                  <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg">{pillar.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {pillar.body}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <QrDemo />
      <NightSimulator />

      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>
          Material interno de presentación. El QR de esta pantalla es una
          demo: no es una entrada real y no abre ninguna puerta.
        </span>
      </p>
    </div>
  )
}

