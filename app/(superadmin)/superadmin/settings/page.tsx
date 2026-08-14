import { CheckCircle2, Handshake, ShieldAlert, ShieldCheck } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeading } from "@/components/superadmin/page-heading"
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

export default function SuperAdminSettingsPage() {
  const checks = [
    {
      label: "Conexión a la base de datos",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hint: "NEXT_PUBLIC_SUPABASE_URL",
    },
    {
      label: "Clave pública de acceso",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hint: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    },
    {
      label: "Clave segura del servidor",
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hint: "SUPABASE_SERVICE_ROLE_KEY",
    },
    {
      label: "Dirección pública del sitio",
      ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      hint: "NEXT_PUBLIC_SITE_URL",
    },
  ]

  return (
    <>
      <PageHeading
        eyebrow="Configuración"
        title="Ajustes de la plataforma"
        description="Revisá que todo esté listo para operar y, si hace falta, promové a otro dueño de la plataforma."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
              <ShieldCheck className="size-4 text-sky-400" />
              Conexiones
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Datos que la plataforma necesita para funcionar. Si falta alguno,
              pedile a quien maneja el servidor que lo configure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-6 pb-6 pt-2">
            {checks.map((check) => (
              <div
                key={check.hint}
                className="flex items-center justify-between rounded-xl bg-muted dark:bg-black/20 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-foreground">{check.label}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {check.hint}
                  </p>
                </div>
                {check.ok ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    Lista
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <ShieldAlert className="size-4" />
                    Falta
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card py-0 text-card-foreground">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="text-base font-medium text-muted-foreground">
              Dar acceso de dueño de la plataforma
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Por seguridad, este permiso solo se asigna a mano desde la base
              de datos.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            <pre className="overflow-x-auto rounded-xl bg-muted p-4 text-xs leading-6 text-foreground ring-1 ring-border">
              <code>{`update public.profiles
set role = 'super_admin'::public.user_role
where email = 'tu@email.com';`}</code>
            </pre>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Ejecutá esta consulta en el editor SQL de Supabase. La persona
              tiene que existir antes en el listado de usuarios.
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card py-0 text-card-foreground lg:col-span-2">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
              <Handshake className="size-4 text-sky-400" />
              Partners globales
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Empresas que confían en Tokepass. Los logos salen en la landing.
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
