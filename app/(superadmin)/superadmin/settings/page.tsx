import { Handshake, Percent } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { getResaleFeePercentage } from "@/app/actions/platform-settings"
import { PageHeading } from "@/components/superadmin/page-heading"
import { PlatformResaleFeeForm } from "@/components/superadmin/platform-resale-fee-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Ajustes",
}

export default async function SuperAdminSettingsPage() {
  const resaleFeePercentage = await getResaleFeePercentage()

  return (
    <>
      <PageHeading
        eyebrow="Configuración"
        title="Ajustes de la plataforma"
        description="Parámetros comerciales y de marca que ves el público. Nada técnico se configura desde acá."
      />

      <div className="grid gap-4">
        <Card className="border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-card to-card py-0 text-card-foreground ring-1 ring-sky-500/20">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Percent className="size-4 text-sky-600 dark:text-sky-400" />
              Configuración Comercial (Marketplace)
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Porcentaje global que se descuenta al vendedor al publicar una
              entrada en el marketplace oficial. El comprador paga el precio
              original.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            <PlatformResaleFeeForm initialPercentage={resaleFeePercentage} />
          </CardContent>
        </Card>

        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
              <Handshake className="size-4 text-sky-400" />
              Sponsors y Marcas
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Logos de productoras o marcas que confían en TokePass. Se muestran
              en el pie de la página pública.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            <Link
              href="/superadmin/settings/sponsors"
              className="inline-flex min-h-11 items-center rounded-xl bg-sky-500/15 px-4 text-sm font-semibold text-sky-800 ring-1 ring-sky-500/20 transition hover:bg-sky-500/25 dark:text-sky-200"
            >
              Gestionar logos
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
