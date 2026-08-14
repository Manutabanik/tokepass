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
import { formatDate, formatNumber, getInitials } from "@/lib/format"

export type OrganizerDirectoryRow = {
  id: string
  name: string
  email: string
  companyName: string | null
  cuitCuil: string | null
  totalEvents: number
  joinedAt: string
}

export function OrganizersDirectory({
  organizers,
}: {
  organizers: OrganizerDirectoryRow[]
}) {
  if (organizers.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center text-sm text-slate-600 dark:text-zinc-400">
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
            className="rounded-2xl border border-white/10 bg-black/30 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-500/15 text-sm font-bold text-violet-300">
                {getInitials(org.name, org.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight text-white">
                  {org.companyName ?? org.name}
                </p>
                <p className="mt-1 truncate text-sm text-slate-600 dark:text-zinc-400">
                  {org.email}
                </p>
                <p className="mt-0.5 font-mono text-xs text-zinc-600">
                  {org.cuitCuil ?? "Sin CUIT"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-emerald-500/35 text-[10px] uppercase text-emerald-800 dark:text-emerald-200"
                >
                  Aprobada
                </Badge>
                <span className="text-xs text-slate-600 dark:text-zinc-400">
                  {formatNumber(org.totalEvents)} eventos ·{" "}
                  {formatDate(org.joinedAt)}
                </span>
              </div>
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
            <TableRow className="border-white/8 hover:bg-transparent">
              <TableHead className="pl-6 text-zinc-600">Productora</TableHead>
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
                <TableCell className="font-mono text-xs text-slate-600 dark:text-zinc-400">
                  {org.cuitCuil ?? "—"}
                </TableCell>
                <TableCell className="text-zinc-300">
                  {formatNumber(org.totalEvents)}
                </TableCell>
                <TableCell className="text-slate-600 dark:text-zinc-400">
                  {formatDate(org.joinedAt)}
                </TableCell>
                <TableCell className="pr-6 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 border-white/15 bg-transparent"
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
