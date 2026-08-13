import { formatCompactCurrency, formatCurrency } from "@/lib/format"
import type { RevenuePoint } from "@/app/actions/platform"

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const max = Math.max(...data.map((point) => point.revenue), 1)
  const total = data.reduce((sum, point) => sum + point.revenue, 0)
  const hasRevenue = total > 0

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-zinc-500">Ingresos · últimos 14 días</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">
            {formatCurrency(total)}
          </p>
        </div>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-400">
          Ventas brutas
        </span>
      </div>

      <div className="mt-6 flex h-40 items-end gap-1.5">
        {data.map((point) => {
          const height = hasRevenue
            ? Math.max((point.revenue / max) * 100, 2)
            : 2

          return (
            <div
              key={point.date}
              className="group relative flex flex-1 flex-col items-center justify-end"
            >
              <div className="pointer-events-none absolute -top-9 z-10 hidden whitespace-nowrap rounded-lg bg-zinc-800 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                {formatCompactCurrency(point.revenue)}
              </div>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-sky-600/40 to-sky-400/80 transition-all group-hover:from-sky-500/60 group-hover:to-sky-300"
                style={{ height: `${height}%` }}
              />
              <span className="mt-2 text-[10px] text-zinc-600">
                {point.label}
              </span>
            </div>
          )
        })}
      </div>

      {!hasRevenue && (
        <p className="mt-4 text-center text-xs text-zinc-600">
          Aún no hay ventas registradas en el período.
        </p>
      )}
    </div>
  )
}
