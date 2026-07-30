import { listPlatformSettlements } from "@/app/actions/superadmin"
import { PlatformSettlementsPanel } from "@/components/superadmin/platform-settlements-panel"

export default async function SuperAdminSettlementsPage() {
  let rows: Awaited<ReturnType<typeof listPlatformSettlements>> = []
  let errorMessage: string | null = null

  try {
    rows = await listPlatformSettlements()
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "No se pudieron cargar liquidaciones."
  }

  if (errorMessage) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-8 text-amber-50">
        <h1 className="text-xl font-bold">Liquidaciones no disponibles</h1>
        <p className="mt-2 text-sm text-amber-100/80">{errorMessage}</p>
      </div>
    )
  }

  return <PlatformSettlementsPanel initialRows={rows} />
}
