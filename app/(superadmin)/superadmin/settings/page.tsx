import { CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react"
import type { Metadata } from "next"

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
      label: "URL de Supabase",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hint: "NEXT_PUBLIC_SUPABASE_URL",
    },
    {
      label: "Clave anónima",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hint: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    },
    {
      label: "Service Role Key (servidor)",
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hint: "SUPABASE_SERVICE_ROLE_KEY",
    },
    {
      label: "URL pública del sitio",
      ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      hint: "NEXT_PUBLIC_SITE_URL",
    },
  ]

  return (
    <>
      <PageHeading
        eyebrow="Configuración"
        title="Ajustes de plataforma"
        description="Estado de la configuración crítica y operaciones de gobierno."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <ShieldCheck className="size-4 text-sky-400" />
              Entorno
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Variables necesarias para operar el panel de plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-6 pb-6 pt-2">
            {checks.map((check) => (
              <div
                key={check.hint}
                className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
              >
                <div>
                  <p className="text-sm text-zinc-200">{check.label}</p>
                  <p className="font-mono text-xs text-zinc-600">
                    {check.hint}
                  </p>
                </div>
                {check.ok ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="size-4" />
                    Configurada
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                    <ShieldAlert className="size-4" />
                    Falta
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="text-base text-white">
              Promover un super administrador
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Por seguridad, el rol de super admin solo se asigna manualmente
              desde la base de datos.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs leading-6 text-zinc-300 ring-1 ring-white/8">
              <code>{`update public.profiles
set role = 'super_admin'::public.user_role
where email = 'tu@email.com';`}</code>
            </pre>
            <p className="mt-4 text-xs leading-5 text-zinc-500">
              Ejecuta esta consulta en el SQL Editor de Supabase. El usuario
              debe existir previamente en Authentication.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
