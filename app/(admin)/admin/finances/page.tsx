import type { Metadata } from "next"

import { getOrganizerFinanceSummary } from "@/app/actions/finances"
import { OrganizerFinancesDashboard } from "@/components/admin/organizer-finances-dashboard"

export const metadata: Metadata = {
  title: "Recaudación y Retiros",
}

export default async function AdminFinancesPage() {
  let summary: Awaited<ReturnType<typeof getOrganizerFinanceSummary>> | null =
    null
  let errorMessage: string | null = null

  try {
    summary = await getOrganizerFinanceSummary()
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "No pudimos cargar el resumen. Reintentá más tarde."
  }

  if (!summary || errorMessage) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-8 text-amber-50">
        <h1 className="text-xl font-bold">Recaudación y Retiros no disponibles</h1>
        <p className="mt-2 text-sm text-amber-100/80">
          {errorMessage ??
            "No pudimos cargar el resumen. Reintentá más tarde."}
        </p>
      </div>
    )
  }

  return <OrganizerFinancesDashboard summary={summary} />
}
