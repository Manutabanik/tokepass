import { Receipt } from "lucide-react"
import type { Metadata } from "next"

import { getPlatformOrders } from "@/app/actions/platform"
import { OrderStatusBadge } from "@/components/superadmin/badges"
import { PageHeading } from "@/components/superadmin/page-heading"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatDateTime } from "@/lib/format"

export const metadata: Metadata = {
  title: "Órdenes",
}

export default async function SuperAdminOrdersPage() {
  const orders = await getPlatformOrders()
  const paidTotal = orders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + order.totalAmount, 0)

  return (
    <>
      <PageHeading
        eyebrow="Transacciones"
        title="Órdenes de la plataforma"
        description="Historial global de compras. Total confirmado a la derecha."
        actions={
          <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-3 text-right">
            <p className="text-xs text-zinc-500">Total confirmado</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(paidTotal)}
            </p>
          </div>
        }
      />

      <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <CardTitle className="text-base text-white">
            {orders.length} {orders.length === 1 ? "orden" : "órdenes"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {orders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="pl-6 text-zinc-600">Orden</TableHead>
                  <TableHead className="text-zinc-600">Comprador</TableHead>
                  <TableHead className="text-zinc-600">Fecha</TableHead>
                  <TableHead className="text-zinc-600">Monto</TableHead>
                  <TableHead className="pr-6 text-right text-zinc-600">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="border-white/8 hover:bg-white/[0.025]"
                  >
                    <TableCell className="py-4 pl-6 font-mono text-xs text-zinc-500">
                      #{order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <p className="truncate text-sm text-zinc-300">
                        {order.buyerName}
                      </p>
                      <p className="truncate text-xs text-zinc-600">
                        {order.buyerEmail}
                      </p>
                    </TableCell>
                    <TableCell className="text-zinc-400">
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-white">
                      {formatCurrency(order.totalAmount)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/5 text-zinc-500">
                  <Receipt className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm text-zinc-500">
                  Todavía no hay órdenes registradas.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
