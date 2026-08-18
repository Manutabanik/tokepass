import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Registro de organizadores",
}

export default async function OrganizerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    pending?: string
    status?: "rejected" | "suspended"
  }>
}) {
  const params = await searchParams
  const pending = params.pending === "1"
  const blockedStatus = params.status

  if (!pending && !blockedStatus) {
    redirect("/organizadores#solicitud")
  }

  return (
    <section className="relative isolate grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden bg-background px-4 py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.18),transparent_42%)]" />
      <div className="w-full max-w-md space-y-4">
        {pending ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Tu cuenta de organizador está pendiente de aprobación. Todavía no
            podés entrar a Tu Panel.
          </div>
        ) : null}
        {blockedStatus ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-100">
            {blockedStatus === "suspended"
              ? "Tu productora está suspendida y no puede operar. Contactá a soporte de Tokepass para revisar el caso."
              : "Tu solicitud de organizador fue rechazada. Contactá a soporte si necesitás una nueva revisión."}
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login-organizador"
            className="inline-flex h-12 min-h-12 flex-1 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Ir al acceso
          </Link>
          <Link
            href="/organizadores#solicitud"
            className="inline-flex h-12 min-h-12 flex-1 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Nueva solicitud
          </Link>
        </div>
      </div>
    </section>
  )
}
