import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getPosEvents } from "@/app/actions/pos"
import { PosTerminal } from "@/components/admin/pos-terminal"
import { ClientErrorBoundary } from "@/components/errors/client-error-boundary"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Boletería POS",
  description: "Punto de venta táctil TokePass: cobro a un tap e impresión térmica.",
}

export default async function DashboardPosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/dashboard/pos")
  }

  let events: Awaited<ReturnType<typeof getPosEvents>> = []
  try {
    const loaded = await getPosEvents()
    events = Array.isArray(loaded) ? loaded : []
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/dashboard/pos")
    }
    events = []
  }

  return (
    <div className="-m-4 h-full min-h-0 sm:-m-8 lg:-m-10">
      <ClientErrorBoundary homeHref="/admin" homeLabel="Ir al inicio">
        <PosTerminal events={events} />
      </ClientErrorBoundary>
    </div>
  )
}
