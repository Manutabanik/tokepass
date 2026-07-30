import type { Metadata } from "next"

import { OrganizerAuthForm } from "@/components/shared/organizer-auth-form"

export const metadata: Metadata = {
  title: "Registro de organizadores",
}

export default async function OrganizerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ pending?: string }>
}) {
  const params = await searchParams
  const pending = params.pending === "1"

  return (
    <section className="relative isolate grid min-h-[calc(100vh-4rem)] place-items-center overflow-hidden bg-[#09090b] px-4 py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.18),transparent_42%)]" />
      <div className="w-full max-w-md space-y-4">
        {pending ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Tu cuenta de organizador está pendiente de aprobación. Todavía no
            podés entrar al Command Center.
          </div>
        ) : null}
        <OrganizerAuthForm mode="register" />
      </div>
    </section>
  )
}
