import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getPromoterMetrics } from "@/app/actions/promoters"
import { PromoterDashboardClient } from "@/components/promoter/promoter-dashboard-client"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Panel RRPP",
  description: "Tu link de afiliado, ventas y comisiones en TokePass.",
}

export default async function RrppDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/rrpp")
  }

  let metrics: Awaited<ReturnType<typeof getPromoterMetrics>> = null

  try {
    metrics = await getPromoterMetrics()
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/rrpp")
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-zinc-950 text-zinc-100 dark">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_55%)]"
        aria-hidden="true"
      />
      <PromoterDashboardClient metrics={metrics} />
    </div>
  )
}
