import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getPromoterMetrics } from "@/app/actions/promoters"
import { PromoterDashboardClient } from "@/components/promoter/promoter-dashboard-client"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Panel de promotores",
  description: "Tu link de ventas y comisiones en Tokepass.",
}

export default async function PromoterDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/promoter/dashboard")
  }

  let metrics: Awaited<ReturnType<typeof getPromoterMetrics>> = null

  try {
    metrics = await getPromoterMetrics()
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/promoter/dashboard")
    }
  }

  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_55%)]"
        aria-hidden="true"
      />
      <PromoterDashboardClient metrics={metrics} />
    </div>
  )
}
