import { ArrowLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { IssuedTicketsManager } from "@/components/admin/issued-tickets-manager"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Lista de Compradores",
  description: "Buscá compradores, reenviá entradas y resolvé reclamos.",
}

export default async function EventIssuedTicketsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login-organizador?next=/admin/events/${id}/tickets`)
  }

  const [{ data: profile }, { data: event }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("events")
      .select("id, title, organizer_id")
      .eq("id", id)
      .maybeSingle(),
  ])

  if (!event) notFound()
  if (event.organizer_id !== user.id && profile?.role !== "super_admin") {
    redirect("/admin/events")
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href={`/admin/events/${id}`}
        className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a operación del evento
      </Link>

      <IssuedTicketsManager eventId={event.id} eventTitle={event.title} />
    </main>
  )
}
