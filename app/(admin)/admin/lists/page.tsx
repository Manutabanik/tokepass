import { ClipboardList } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { getOrganizerEvents } from "@/app/actions/events"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatEventDate } from "@/lib/format"

export const metadata: Metadata = {
  title: "Listas digitales",
}

export default async function AdminListsHubPage() {
  let events: Awaited<ReturnType<typeof getOrganizerEvents>> = []

  try {
    events = await getOrganizerEvents()
  } catch {
    redirect("/login-organizador?next=/admin/lists")
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-sm font-medium text-violet-400">FreePass</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-white">
          Listas digitales
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Elegí un evento para crear listas de promotores y RRPP, prensa y
          cortesías con QR dinámico.
        </p>
      </div>

      {events.length === 0 ? (
        <Card className="border-0 bg-white/[0.035] ring-1 ring-white/8">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ClipboardList className="size-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">
              Todavía no tenés eventos. Creá uno para gestionar listas.
            </p>
            <Link
              href="/admin/events/create"
              className="text-sm font-semibold text-violet-300 hover:text-violet-200"
            >
              Crear evento →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => (
            <Link key={event.id} href={`/admin/events/${event.id}/lists`}>
              <Card className="h-full border-0 bg-white/[0.035] transition hover:bg-white/[0.05] hover:ring-violet-500/20 ring-1 ring-white/8">
                <CardHeader>
                  <CardTitle className="text-white">{event.title}</CardTitle>
                  <CardDescription className="capitalize">
                    {formatEventDate(event.date)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm font-medium text-violet-300">
                    Gestionar listas →
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
