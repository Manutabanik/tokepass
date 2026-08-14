import { ArrowLeft, Building2, Construction, WalletCards } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { getOrganizationDetails } from "@/app/actions/superadmin"
import { OrganizationGovernancePanel } from "@/components/superadmin/organization-governance-panel"
import { PageHeading } from "@/components/superadmin/page-heading"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatDate, getInitials } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/admin"

export const metadata: Metadata = {
  title: "Detalles de la Productora",
}

export default async function SuperAdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let organization: Awaited<ReturnType<typeof getOrganizationDetails>> = null
  let loadError: string | null = null

  try {
    organization = await getOrganizationDetails(id)
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "No pudimos cargar los datos de la productora."
  }

  // Fallback mínimo si el perfil existe pero el detalle completo falló / no califica.
  if (!organization) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, email, created_at")
      .eq("id", id)
      .maybeSingle()

    return (
      <>
        <Link
          href="/superadmin/organizations"
          className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a productoras
        </Link>

        <PageHeading
          eyebrow="Productora"
          title="Detalles de la Productora"
          description={
            profile
              ? `${profile.full_name?.trim() || profile.email} · ${profile.email}`
              : "No encontramos esta productora en la base."
          }
        />

        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardContent className="grid min-h-56 place-items-center px-6 py-12 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-800 ring-1 ring-amber-400/20 dark:text-amber-300">
                <Construction className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-4 text-base font-semibold text-foreground">
                {profile
                  ? "Resumen en construcción"
                  : "Productora no encontrada"}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {loadError
                  ? `Hubo un problema al armar el detalle: ${loadError}`
                  : profile
                    ? "La ficha básica está, pero todavía no pudimos armar el panel completo de finanzas. Probá más tarde o revisá las migraciones de gobierno."
                    : "Revisá el enlace o volvé al listado de productoras."}
              </p>
              {profile ? (
                <p className="mt-4 font-mono text-xs text-muted-foreground">
                  ID · {profile.id.slice(0, 8)} · Alta{" "}
                  {formatDate(profile.created_at)}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <Link
        href="/superadmin/organizations"
        className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Volver a productoras
      </Link>

      <PageHeading
        eyebrow="Productora"
        title="Detalles de la Productora"
        description={`${organization.profile.name} · ${organization.profile.email} · Alta ${formatDate(organization.profile.joinedAt)}`}
        actions={
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
            <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-sm font-bold text-violet-800 ring-1 ring-violet-400/20 dark:text-violet-200">
              {getInitials(
                organization.profile.name,
                organization.profile.email,
              )}
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Identificador</p>
              <p className="font-mono text-xs text-muted-foreground">
                {organization.profile.id.slice(0, 8)}
              </p>
            </div>
          </div>
        }
      />

      <OrganizationGovernancePanel organization={organization} />

      <Card className="mt-6 border border-border bg-card py-0 text-card-foreground">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <WalletCards className="size-5 text-emerald-700 dark:text-emerald-400" />
              Liquidaciones pendientes
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Plata que todavía le debemos transferir a esta productora.
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
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
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted dark:bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {settlement.periodLabel ?? "Liquidación"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Creada {formatDate(settlement.createdAt)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-mono font-bold text-emerald-800 dark:text-emerald-300">
                      Neto {formatCurrency(settlement.netAmount)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Bruto {formatCurrency(settlement.grossAmount)} · Comisión{" "}
                      {formatCurrency(settlement.platformFee)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center text-center">
              <div>
                <Building2 className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
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
