import { ArrowRight, Building2 } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { listApprovedOrganizers } from "@/app/actions/organizer-kyb"
import { PageHeading } from "@/components/superadmin/page-heading"
import { Button } from "@/components/ui/button"
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
import { formatDate, formatNumber, getInitials } from "@/lib/format"

export const metadata: Metadata = {
  title: "Productoras",
}

export default async function SuperAdminOrganizersPage() {
  const organizers = await listApprovedOrganizers()

  return (
    <>
      <PageHeading
        eyebrow="B2B"
        title="Productoras aprobadas"
        description="Organizadores con KYB aprobado. Desde acá entrás al gobierno financiero de cada una."
      />

      <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="border-b border-white/8 px-5 py-5">
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Building2 className="size-4 text-violet-300" />
            {organizers.length}{" "}
            {organizers.length === 1 ? "productora" : "productoras"}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {organizers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead className="pl-6 text-zinc-600">
                    Productora
                  </TableHead>
                  <TableHead className="text-zinc-600">CUIT</TableHead>
                  <TableHead className="text-zinc-600">Eventos</TableHead>
                  <TableHead className="text-zinc-600">Alta</TableHead>
                  <TableHead className="pr-6 text-right text-zinc-600">
                    Detalle
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizers.map((org) => (
                  <TableRow
                    key={org.id}
                    className="border-white/8 hover:bg-white/[0.025]"
                  >
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-full bg-violet-500/10 text-xs font-medium text-violet-300">
                          {getInitials(org.name, org.email)}
                        </span>
                        <div>
                          <p className="font-medium text-zinc-100">
                            {org.companyName ?? org.name}
                          </p>
                          <p className="text-xs text-zinc-600">{org.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">
                      {org.cuitCuil ?? "—"}
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      {formatNumber(org.totalEvents)}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDate(org.joinedAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/15 bg-transparent"
                        nativeButton={false}
                        render={
                          <Link href={`/superadmin/organizations/${org.id}`} />
                        }
                      >
                        Ver finanzas
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid min-h-48 place-items-center text-sm text-zinc-500">
              Todavía no hay productoras aprobadas.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
