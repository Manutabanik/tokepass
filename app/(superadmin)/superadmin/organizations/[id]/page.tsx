import { ArrowLeft, Building2, WalletCards } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getOrganizationDetails } from "@/app/actions/superadmin"
import { OrganizationGovernancePanel } from "@/components/superadmin/organization-governance-panel"
import { PageHeading } from "@/components/superadmin/page-heading"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatDate, getInitials } from "@/lib/format"

export const metadata: Metadata = {
  title: "Gobierno de productora",
}

export default async function SuperAdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const organization = await getOrganizationDetails(id)

  if (!organization) notFound()

  return (
    <>
      <Link
        href="/superadmin/organizations"
        className="mb-7 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a organizaciones
      </Link>

      <PageHeading
        eyebrow="God Mode · Productora"
        title={organization.profile.name}
        description={`${organization.profile.email} · Alta ${formatDate(organization.profile.joinedAt)}`}
        actions={
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3">
            <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-sm font-bold text-violet-200 ring-1 ring-violet-400/20">
              {getInitials(
                organization.profile.name,
                organization.profile.email,
              )}
            </span>
            <div>
              <p className="text-xs text-zinc-600">ID de productora</p>
              <p className="font-mono text-xs text-zinc-300">
                {organization.profile.id.slice(0, 8)}
              </p>
            </div>
          </div>
        }
      />

      <OrganizationGovernancePanel organization={organization} />

      <Card className="mt-6 border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <WalletCards className="size-5 text-emerald-400" />
              Liquidaciones pendientes
            </CardTitle>
            <p className="mt-1 text-xs text-zinc-600">
              Obligaciones abiertas con esta productora.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-amber-400/30 bg-amber-400/10 text-amber-200"
          >
            {organization.metrics.pendingSettlementCount} ·{" "}
            {formatCurrency(organization.metrics.pendingSettlementAmount)}
          </Badge>
        </CardHeader>
        <CardContent className="px-6 py-5">
          {organization.pendingSettlements.length > 0 ? (
            <div className="grid gap-2">
              {organization.pendingSettlements.map((settlement) => (
                <article
                  key={settlement.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/8 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-zinc-200">
                      {settlement.periodLabel ?? "Liquidación"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Creada {formatDate(settlement.createdAt)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-mono font-bold text-emerald-300">
                      Neto {formatCurrency(settlement.netAmount)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Bruto {formatCurrency(settlement.grossAmount)} · Fee{" "}
                      {formatCurrency(settlement.platformFee)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center text-center">
              <div>
                <Building2 className="mx-auto size-6 text-zinc-700" />
                <p className="mt-3 text-sm text-zinc-500">
                  No hay liquidaciones pendientes.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
