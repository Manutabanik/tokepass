import {
  CalendarDays,
  ChevronRight,
  MapPin,
  Settings2,
} from "lucide-react"
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
        actions={
          <Link
            href="/superadmin/auditoria"
            className="inline-flex h-11 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 px-4 text-sm font-semibold text-sky-800 transition hover:bg-sky-500/20 dark:text-sky-200"
          >
            Eventos Pendientes
          </Link>
        }
      />

      <Card className="border border-border bg-card py-0 text-card-foreground">
        <CardHeader className="border-b border-border px-5 py-5 sm:px-6">
          <CardTitle className="text-base font-medium text-muted-foreground">
            {events.length} {events.length === 1 ? "evento" : "eventos"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="pl-6 text-muted-foreground">Evento</TableHead>
                  <TableHead className="text-muted-foreground">Organizador</TableHead>
                  <TableHead className="text-muted-foreground">Fecha</TableHead>
                  <TableHead className="pr-6 text-right text-muted-foreground">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow
                    key={event.id}
                    className="border-border hover:bg-muted/50"
                  >
                    <TableCell className="max-w-72 py-4 pl-6">
                      <Link
                        href={`/superadmin/events/${event.id}`}
                        className="group block"
                      >
                        <p className="flex items-center gap-1 truncate font-medium text-foreground group-hover:text-primary">
                          {event.title}
                          <ChevronRight
                            className="size-3.5 shrink-0 text-muted-foreground group-hover:text-sky-700 dark:group-hover:text-sky-300"
                            aria-hidden="true"
                          />
                        </p>
                        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="size-3" aria-hidden="true" />
                          {event.location}
                        </p>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="truncate text-sm text-foreground">
                        {event.organizerName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {event.organizerEmail}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(event.date)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <EventStatusBadge status={event.status} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Link
                        href={`/admin/events/${event.id}/edit`}
                        className="inline-flex h-10 min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
                      >
                        <Settings2 className="size-3.5" aria-hidden="true" />
                        Configurar
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <CalendarDays className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm text-muted-foreground">
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
