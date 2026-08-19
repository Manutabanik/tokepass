import type { Metadata } from "next"
import { Building2, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  getMyOrganizerApplication,
} from "@/app/actions/organizer-kyb"
import { OrganizerApplicationWizard } from "@/components/public/organizer-application-wizard"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Postular productora",
  description:
    "Solicitá acceso como productora. Validamos tu KYB en menos de 24 horas.",
}

export default async function PostularProductoraPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/postular-productora")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organizer_approval_status")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role === "super_admin") {
    redirect("/superadmin")
  }

  if (
    profile?.role === "admin" &&
    profile.organizer_approval_status === "approved"
  ) {
    redirect("/admin")
  }

  const application = await getMyOrganizerApplication()

  return (
    <section className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden bg-background px-4 py-14 text-foreground">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.2),transparent_45%)]" />
      <div className="mx-auto w-full max-w-xl space-y-8">
        <div className="text-center">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Know Your Business
          </p>
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            Postulá tu productora
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Nadie es organizador por defecto. Completá estos datos y el equipo
            de TokePass valida tu productora antes de darte acceso a Tu Panel.
          </p>
        </div>

        {application?.status === "rejected" ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Tu solicitud anterior fue rechazada. Podés enviar una nueva con
            datos actualizados.
          </div>
        ) : null}

        <OrganizerApplicationWizard
          initialStatus={
            application?.status === "pending" ||
            application?.status === "approved"
              ? application.status
              : null
          }
        />

        <p className="text-center text-xs text-muted-foreground">
          ¿Todavía no tenés cuenta?{" "}
          <Link href="/register" className="text-violet-700 hover:text-violet-600 dark:text-violet-300 dark:hover:text-violet-200">
            Registrate como comprador
          </Link>{" "}
          y después volvé a postularte.
        </p>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            Al aprobarse, tu cuenta pasa a operar como productora (rol
            organizador en el sistema). Hasta entonces seguís siendo comprador.
          </p>
        </div>
      </div>
    </section>
  )
}
