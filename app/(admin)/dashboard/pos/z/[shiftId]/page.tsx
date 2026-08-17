import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { getTicketZReport } from "@/app/actions/pos"
import { PosTicketZView } from "@/components/admin/pos-ticket-z"
import { PrintTicketActions } from "@/components/public/print-ticket-actions"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Ticket Z — Arqueo de turno",
  robots: { index: false, follow: false },
}

export default async function DashboardPosTicketZPage({
  params,
  searchParams,
}: {
  params: Promise<{ shiftId: string }>
  searchParams: Promise<{ autoprint?: string }>
}) {
  const { shiftId } = await params
  const query = await searchParams
  const autoPrint = query.autoprint === "1" || query.autoprint === "true"

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login-organizador?next=/dashboard/pos/z/${shiftId}`)

  const report = await getTicketZReport(shiftId)
  if (!report) notFound()

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-100 px-4 py-8 text-zinc-950">
      <div className="no-print mx-auto mb-6 flex max-w-[300px] justify-end">
        <PrintTicketActions autoPrint={autoPrint} />
      </div>
      <PosTicketZView report={report} />
    </div>
  )
}
