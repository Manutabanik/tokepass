import type { Metadata } from "next"
import Link from "next/link"

import { OrganizerRegisterForm } from "@/components/shared/organizer-register-form"
import { safeInternalNextPath } from "@/lib/auth/next-path"

export const metadata: Metadata = {
  title: "Crear cuenta de Organizador",
}

export default async function OrganizerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    pending?: string
    status?: "rejected" | "suspended"
    error?: string
    next?: string
  }>
}) {
  const params = await searchParams
  const pending = params.pending === "1"
  const blockedStatus = params.status

  return (
    <section className="relative isolate grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden bg-background px-4 py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.18),transparent_42%)]" />
      <div className="w-full max-w-md space-y-4">
        {pending ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            Ya podés entrar a Tu Panel y armar eventos. La venta al público se
            habilita después de la auditoría de cada evento.
          </div>
        ) : null}
        {blockedStatus ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-100">
            {blockedStatus === "suspended"
              ? "Tu productora está suspendida y no puede operar. Contactá a soporte de TokePass para revisar el caso."
              : "Tu solicitud de organizador fue rechazada. Contactá a soporte si necesitás una nueva revisión."}
          </div>
        ) : null}
        {blockedStatus ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login-organizador"
              className="inline-flex h-12 min-h-12 flex-1 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Ir al acceso
            </Link>
          </div>
        ) : (
          <OrganizerRegisterForm
            initialError={params.error}
            nextPath={safeInternalNextPath(params.next)}
          />
        )}
      </div>
    </section>
  )
}
