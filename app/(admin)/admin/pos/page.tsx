import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getPosEvents } from "@/app/actions/pos"
import { PosTerminal } from "@/components/admin/pos-terminal"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Boletería",
  description:
    "Cobrá en puerta: efectivo, Posnet o transferencia — Tokepass.",
}

export default async function AdminPosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/pos")
  }

  let events: Awaited<ReturnType<typeof getPosEvents>> = []
  try {
    events = await getPosEvents()
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/admin/pos")
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400/90">
          Puerta
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-foreground">
          Boletería
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Abrí la caja, cobrá (efectivo / Posnet / transferencia) e imprimí el
          ticket térmico.
        </p>
      </header>

      <PosTerminal events={events} />
    </div>
  )
}
