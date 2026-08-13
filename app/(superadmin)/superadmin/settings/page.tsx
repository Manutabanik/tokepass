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
        <Card className="border-0 bg-white/[0.035] py-0 ring-1 ring-white/8">
          <CardHeader className="px-6 pt-6">
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <ShieldCheck className="size-4 text-sky-400" />
              Conexiones
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Datos que la plataforma necesita para funcionar. Si falta alguno,
              pedile a quien maneja el servidor que lo configure.
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
                    Lista
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
              Dar acceso de dueño de la plataforma
            </CardTitle>
            <CardDescription className="text-zinc-500">
              Por seguridad, este permiso solo se asigna a mano desde la base
              de datos.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs leading-6 text-zinc-300 ring-1 ring-white/8">
              <code>{`update public.profiles
set role = 'super_admin'::public.user_role
where email = 'tu@email.com';`}</code>
            </pre>
            <p className="mt-4 text-xs leading-5 text-zinc-500">
              Ejecutá esta consulta en el editor SQL de Supabase. La persona
              tiene que existir antes en el listado de usuarios.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
