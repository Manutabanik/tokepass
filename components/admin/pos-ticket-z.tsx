import type { TicketZReport } from "@/app/actions/pos"
import { formatCurrency, formatEventDay, formatEventTime } from "@/lib/format"

export type { TicketZReport }

/** Ticket Z 80mm — cierre de turno / arqueo. */
export function PosTicketZView({ report }: { report: TicketZReport }) {
  const totalSales =
    report.cashSalesTotal + report.cardSalesTotal + report.transferSalesTotal

  return (
    <div className="print-ticket mx-auto max-w-[300px] bg-white p-3 text-left text-black">
      <p className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
        Tokepass · Ticket Z
      </p>
      <h1 className="mt-1 text-center text-base font-black leading-tight">
        Cierre de turno
      </h1>
      <p className="mt-1 text-center text-xs font-semibold">{report.eventTitle}</p>

      <div className="my-3 border-y border-dashed border-zinc-400 py-2 text-[11px] leading-5">
        <p>
          <span className="text-zinc-600">Cajero:</span> {report.cashierName}
        </p>
        <p>
          <span className="text-zinc-600">Apertura:</span>{" "}
          {formatEventDay(report.openedAt)} · {formatEventTime(report.openedAt)}
        </p>
        <p>
          <span className="text-zinc-600">Cierre:</span>{" "}
          {report.closedAt
            ? `${formatEventDay(report.closedAt)} · ${formatEventTime(report.closedAt)}`
            : "—"}
        </p>
      </div>

      <div className="space-y-1 text-[11px]">
        <ZRow label="Fondo inicial" value={formatCurrency(report.startAmount)} />
        <ZRow
          label="Efectivo"
          value={formatCurrency(report.cashSalesTotal)}
        />
        <ZRow
          label="Tarjeta / Posnet"
          value={formatCurrency(report.cardSalesTotal)}
        />
        <ZRow
          label="Transferencia"
          value={formatCurrency(report.transferSalesTotal)}
        />
        <ZRow label="Total ventas" value={formatCurrency(totalSales)} strong />
        <ZRow
          label="Efectivo a entregar"
          value={formatCurrency(report.endAmountExpected)}
          strong
        />
        {report.endAmountCounted != null ? (
          <ZRow
            label="Conteo real"
            value={formatCurrency(report.endAmountCounted)}
          />
        ) : null}
        <ZRow label="Entradas emitidas" value={String(report.ticketsSold)} />
      </div>

      {report.byTier.length > 0 ? (
        <div className="mt-3 border-t border-dashed border-zinc-400 pt-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
            Por categoría
          </p>
          <ul className="space-y-0.5 text-[11px]">
            {report.byTier.map((row) => (
              <li
                key={row.tierName}
                className="flex items-start justify-between gap-2"
              >
                <span className="min-w-0 truncate">
                  {row.tierName} ×{row.count}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatCurrency(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-center font-mono text-[9px] text-slate-600 dark:text-zinc-400">
        Turno #{report.shiftId.slice(0, 8).toUpperCase()}
      </p>
    </div>
  )
}

function ZRow({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-600">{label}</span>
      <span className={strong ? "font-black tabular-nums" : "tabular-nums"}>
        {value}
      </span>
    </div>
  )
}
