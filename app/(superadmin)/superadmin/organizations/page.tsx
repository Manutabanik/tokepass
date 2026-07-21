import { Building2 } from "lucide-react"
import type { Metadata } from "next"

import { getOrganizations } from "@/app/actions/platform"
import { RoleBadge } from "@/components/superadmin/badges"
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
import { formatCurrency, formatDate, formatNumber, getInitials } from "@/lib/format"

export const metadata: Metadata = {
  title: "Organizaciones",
}

export default async function SuperAdminOrganizationsPage() {
  const organizations = await getOrganizations()

  return (
    <>
      <PageHeading
        eyebrow="Ecosistema"
        title="Organizaciones"
        description="Todos los organizadores de la plataforma con su volumen de eventos e ingresos generados."
      />

      <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="border-b border-white/8 px-5 py-5 sm:px-6">
          <CardTitle className="text-base text-white">
            {organizations.length}{" "}
            {organizations.length === 1 ? "organización" : "organizaciones"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          {organizations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="pl-6 text-zinc-600">
                    Organizador
                  </TableHead>
                  <TableHead className="text-zinc-600">Eventos</TableHead>
                  <TableHead className="text-zinc-600">Tickets</TableHead>
                  <TableHead className="text-zinc-600">GMV</TableHead>
                  <TableHead className="pr-6 text-right text-zinc-600">
                    Alta
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((organization) => (
                  <TableRow
                    key={organization.id}
                    className="border-white/8 hover:bg-white/[0.025]"
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-500/10 text-xs font-medium text-violet-300">
                          {getInitials(organization.name, organization.email)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-zinc-200">
                              {organization.name}
                            </p>
                            <RoleBadge role={organization.role} />
                          </div>
                          <p className="truncate text-xs text-zinc-600">
                            {organization.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      <span className="font-medium text-white">
                        {formatNumber(organization.totalEvents)}
                      </span>
                      <span className="ml-1 text-xs text-zinc-600">
                        ({formatNumber(organization.publishedEvents)} pub.)
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      {formatNumber(organization.ticketsSold)}
                    </TableCell>
                    <TableCell className="font-medium text-white">
                      {formatCurrency(organization.grossRevenue)}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-zinc-400">
                      {formatDate(organization.joinedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/5 text-zinc-500">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm text-zinc-500">
                  Todavía no hay organizadores registrados.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
