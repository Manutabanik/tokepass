import { ArrowLeft, ClipboardList, TicketCheck, Users } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import {
  getEventGuestLists,
  getGuestListEntries,
} from "@/app/actions/guest-lists"
import { CreateGuestListDialog } from "@/components/admin/create-guest-list-dialog"
import { GuestListsManager } from "@/components/admin/guest-lists-manager"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createClient } from "@/lib/supabase/server"
import { formatNumber } from "@/lib/format"

export const metadata: Metadata = {
  title: "Listas digitales",
}

export default async function EventGuestListsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: eventId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=/admin/events/${eventId}/lists`)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  const { data: event } = await supabase
    .from("events")
    .select("id, title, organizer_id")
    .eq("id", eventId)
    .maybeSingle()

  if (!event) notFound()

  if (
    profile?.role !== "super_admin" &&
    event.organizer_id !== user.id
  ) {
    redirect("/admin")
  }

  let lists: Awaited<ReturnType<typeof getEventGuestLists>>["lists"] = []
  let metrics: Awaited<ReturnType<typeof getEventGuestLists>>["metrics"] = {
    totalCapacity: 0,
    claimed: 0,
    checkedIn: 0,
    pending: 0,
  }

  try {
    ;({ lists, metrics } = await getEventGuestLists(eventId))
  } catch {
    redirect("/admin")
  }

  const entriesByListId: Record<
    string,
    Awaited<ReturnType<typeof getGuestListEntries>>
  > = {}

  await Promise.all(
    lists.map(async (list) => {
      entriesByListId[list.id] = await getGuestListEntries(list.id)
    }),
  )

  const kpis = [
    {
      label: "Total cupos listas",
      value: formatNumber(metrics.totalCapacity),
      icon: ClipboardList,
    },
    {
      label: "Canjeados",
      value: formatNumber(metrics.claimed),
      icon: TicketCheck,
    },
    {
      label: "Escaneados en puerta",
      value: formatNumber(metrics.checkedIn),
      icon: Users,
    },
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <Link
          href="/admin/lists"
          className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
        >
          <ArrowLeft className="size-4" />
          Volver a Listas
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-400">FreePass</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.035em] text-white">
              Listas · {event.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-500">
              Cortesías $0 con QR Living Ticket, cupos y hora límite de ingreso.
            </p>
          </div>
          <CreateGuestListDialog eventId={eventId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map(({ label, value, icon: Icon }) => (
          <Card
            key={label}
            className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8"
          >
            <CardHeader className="flex flex-row items-center justify-between px-5 pb-2 pt-5">
              <CardDescription>{label}</CardDescription>
              <Icon className="size-4 text-zinc-500" />
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <CardTitle className="text-3xl text-white">{value}</CardTitle>
            </CardContent>
          </Card>
        ))}
      </div>

      <GuestListsManager lists={lists} entriesByListId={entriesByListId} />
    </div>
  )
}
