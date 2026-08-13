import { CalendarDays, ChevronRight, MapPin } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { getPlatformEvents } from "@/app/actions/platform"
import { EventStatusBadge } from "@/components/superadmin/badges"
import { PageHeading } from "@/components/superadmin/page-heading"
import {
  Card,
  CardContent,
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
import { formatDateTime } from "@/lib/format"

export const metadata: Metadata = {
  title: "Eventos",
}

export default async function SuperAdminEventsPage() {
  const events = await getPlatformEvents()

  return (
    <>
      <PageHeading
        eyebrow="Cartelera"
        title="Todos los eventos"
        description="Acá ves todos los eventos de la plataforma, sin importar qué productora los creó."
      />

      <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <CardTitle className="text-base text-white">
            {events.length} {events.length === 1 ? "evento" : "eventos"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="pl-6 text-zinc-600">Evento</TableHead>
                  <TableHead className="text-zinc-600">Organizador</TableHead>
                  <TableHead className="text-zinc-600">Fecha</TableHead>
                  <TableHead className="pr-6 text-right text-zinc-600">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow
                    key={event.id}
                    className="border-white/8 hover:bg-white/[0.025]"
                  >
                    <TableCell className="max-w-72 py-4 pl-6">
                      <Link
                        href={`/superadmin/events/${event.id}`}
                        className="group block"
                      >
                        <p className="flex items-center gap-1 truncate font-medium text-zinc-200 group-hover:text-white">
                          {event.title}
                          <ChevronRight
                            className="size-3.5 shrink-0 text-zinc-600 group-hover:text-sky-300"
                            aria-hidden="true"
                          />
                        </p>
                        <p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-600">
                          <MapPin className="size-3" aria-hidden="true" />
                          {event.location}
                        </p>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="truncate text-sm text-zinc-300">
                        {event.organizerName}
                      </p>
                      <p className="truncate text-xs text-zinc-600">
                        {event.organizerEmail}
                      </p>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {formatDateTime(event.date)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <EventStatusBadge status={event.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/5 text-zinc-500">
                  <CalendarDays className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm text-zinc-500">
                  Aún no se han creado eventos en la plataforma.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
