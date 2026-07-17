import type { Metadata } from "next"
import {
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  CircleDollarSign,
  MapPin,
  Sparkles,
  TicketCheck,
  TrendingUp,
  Users,
} from "lucide-react"
import Link from "next/link"

import { getOrganizerEvents } from "@/app/actions/events"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { EventStatus } from "@/types/database"

export const metadata: Metadata = {
  title: "Dashboard",
}

const metrics = [
  {
    label: "Ingresos de hoy",
    value: "$ 1.284.500",
    helper: "+18,2% vs. ayer",
    icon: CircleDollarSign,
    className: "lg:col-span-5",
  },
  {
    label: "Tickets vendidos",
    value: "842",
    helper: "68 en la última hora",
    icon: TicketCheck,
    className: "lg:col-span-4",
  },
  {
    label: "Conversión de RRPP",
    value: "12,8%",
    helper: "+2,4 puntos este mes",
    icon: Users,
    className: "lg:col-span-3",
  },
] as const

const statusPresentation: Record<
  EventStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Borrador",
    className: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  },
  published: {
    label: "Publicado",
    className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  },
  cancelled: {
    label: "Cancelado",
    className: "border-red-400/20 bg-red-400/10 text-red-300",
  },
  completed: {
    label: "Finalizado",
    className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
  },
}

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export default async function AdminDashboardPage() {
  const events = await getOrganizerEvents()

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-violet-400">
            <Sparkles className="size-4" aria-hidden="true" />
            Resumen ejecutivo
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
            Buen día, equipo.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            Todo lo que está pasando en tu operación, ordenado para tomar
            decisiones rápidas.
          </p>
        </div>
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href="/admin/events/create" />}
          className="h-11 rounded-xl bg-violet-600 px-5 text-white shadow-lg shadow-violet-950/30 hover:bg-violet-500"
        >
          Crear evento
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
        {metrics.map(({ label, value, helper, icon: Icon, className }) => (
          <Card
            key={label}
            className={`border-0 bg-white/[0.035] py-0 ring-1 ring-white/8 ${className}`}
          >
            <CardHeader className="px-5 pt-5">
              <CardDescription className="text-zinc-500">
                {label}
              </CardDescription>
              <CardAction>
                <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/10">
                  <Icon className="size-[18px]" aria-hidden="true" />
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <p className="text-3xl font-bold tracking-[-0.04em] text-white">
                {value}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                <TrendingUp className="size-3.5" aria-hidden="true" />
                {helper}
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8 md:col-span-2 lg:col-span-8">
          <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
            <CardTitle className="text-base text-white">
              Eventos activos
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Tu cartelera y su estado operativo.
            </CardDescription>
            <CardAction>
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/admin/events" />}
                className="text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                Ver todos
                <ArrowUpRight aria-hidden="true" />
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent className="px-0 pb-0">
            {events.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="pl-6 text-zinc-600">Evento</TableHead>
                    <TableHead className="text-zinc-600">Fecha</TableHead>
                    <TableHead className="text-zinc-600">Venue</TableHead>
                    <TableHead className="pr-6 text-right text-zinc-600">
                      Estado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.slice(0, 6).map((event) => {
                    const status = statusPresentation[event.status]

                    return (
                      <TableRow
                        key={event.id}
                        className="border-white/8 hover:bg-white/[0.025]"
                      >
                        <TableCell className="max-w-64 py-4 pl-6">
                          <p className="truncate font-medium text-zinc-200">
                            {event.title}
                          </p>
                          <p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-600">
                            <MapPin className="size-3" aria-hidden="true" />
                            {event.location}
                          </p>
                        </TableCell>
                        <TableCell className="text-zinc-400">
                          {dateFormatter.format(new Date(event.date))}
                        </TableCell>
                        <TableCell className="text-zinc-400">
                          {event.venues?.name ?? "Sin venue"}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <Badge
                            variant="outline"
                            className={status.className}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="grid min-h-80 place-items-center px-6 py-12 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-500/15">
                    <CalendarPlus className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-white">
                    Tu próxima experiencia empieza acá
                  </h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                    Crea tu primer evento y configura entradas, zonas, RRPP y
                    add-ons desde un solo lugar.
                  </p>
                  <Button
                    nativeButton={false}
                    render={<Link href="/admin/events/create" />}
                    className="mt-5 bg-violet-600 text-white hover:bg-violet-500"
                  >
                    Crear mi primer evento
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.16),transparent_48%),rgba(255,255,255,0.035)] py-0 ring-1 ring-white/8 md:col-span-2 lg:col-span-4">
          <CardHeader className="px-6 pt-6">
            <span className="mb-4 grid size-11 place-items-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-400/15">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-lg text-white">
              Operación bajo control
            </CardTitle>
            <CardDescription className="max-w-sm leading-6 text-zinc-500">
              Configura venues, cupos y accesos antes de publicar. Tokepass
              mantiene cada capa sincronizada.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-black/20 p-3 ring-1 ring-white/5">
                <p className="text-2xl font-bold text-white">{events.length}</p>
                <p className="mt-1 text-xs text-zinc-600">Eventos totales</p>
              </div>
              <div className="rounded-xl bg-black/20 p-3 ring-1 ring-white/5">
                <p className="text-2xl font-bold text-white">
                  {
                    events.filter((event) => event.status === "published")
                      .length
                  }
                </p>
                <p className="mt-1 text-xs text-zinc-600">Publicados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
