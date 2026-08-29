"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { OrganizerDirectoryFeeField } from "@/components/superadmin/organizer-directory-fee-field"
import { formatDate, formatNumber, getInitials } from "@/lib/format"

export type OrganizerDirectoryRow = {
  id: string
  name: string
  email: string
  companyName: string | null
  cuitCuil: string | null
  totalEvents: number
  joinedAt: string
  feePercentage: number
}

export function OrganizersDirectory({
  organizers,
}: {
  organizers: OrganizerDirectoryRow[]
}) {
  if (organizers.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">
        Todavía no hay productoras aprobadas.
      </div>
    )
  }

  return (
    <>
      {/* Mobile data cards */}
      <div className="grid gap-3 p-4 md:hidden">
        {organizers.map((org) => (
          <article
            key={org.id}
            className="rounded-2xl border border-border bg-card p-4 text-card-foreground"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-500/15 text-sm font-bold text-violet-700 dark:text-violet-300">
                {getInitials(org.name, org.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight text-foreground">
                  {org.companyName ?? org.name}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {org.email}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {org.cuitCuil ?? "Sin CUIT"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-full border-emerald-500/35 text-[10px] uppercase text-emerald-800 dark:text-emerald-200"
              >
                Aprobada
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatNumber(org.totalEvents)} eventos ·{" "}
                {formatDate(org.joinedAt)}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Comisión
              </span>
              <OrganizerDirectoryFeeField
                organizerId={org.id}
                feePercentage={org.feePercentage}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                className="min-h-12 shrink-0 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white hover:bg-sky-500"
                nativeButton={false}
                render={
                  <Link href={`/superadmin/organizations/${org.id}`} />
                }
              >
                Gestionar
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </article>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="pl-6 text-muted-foreground">Productora</TableHead>
              <TableHead className="text-muted-foreground">CUIT</TableHead>
              <TableHead className="text-muted-foreground">Eventos</TableHead>
              <TableHead className="text-muted-foreground">Comisión</TableHead>
              <TableHead className="text-muted-foreground">Alta</TableHead>
              <TableHead className="pr-6 text-right text-muted-foreground">
                Detalle
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizers.map((org) => (
              <TableRow
                key={org.id}
                className="border-border hover:bg-muted/50"
              >
                <TableCell className="min-w-[150px] max-w-[250px] py-4 pl-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-500/10 text-xs font-medium text-violet-700 dark:text-violet-300">
                      {getInitials(org.name, org.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {org.companyName ?? org.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {org.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-[150px] max-w-[250px] font-mono text-xs text-muted-foreground">
                  <span className="block truncate">{org.cuitCuil ?? "—"}</span>
                </TableCell>
                <TableCell className="text-foreground">
                  {formatNumber(org.totalEvents)}
                </TableCell>
                <TableCell>
                  <OrganizerDirectoryFeeField
                    organizerId={org.id}
                    feePercentage={org.feePercentage}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(org.joinedAt)}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 border-border bg-transparent"
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
      </div>
    </>
  )
}
