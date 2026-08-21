import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getMyAccountProfile } from "@/app/actions/account"
import { AccountProfileForm } from "@/components/account/account-profile-form"

export const metadata: Metadata = {
  title: "Mis Datos",
  description: "Editá tu perfil y foto en TokePass.",
}

export default async function CuentaPerfilPage() {
  let profile: Awaited<ReturnType<typeof getMyAccountProfile>>

  try {
    profile = await getMyAccountProfile()
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/cuenta/perfil")
    }
    throw error
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300/90">
          Perfil
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Mis datos personales
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Foto, DNI y contacto para checkout rápido y respaldo en puerta.
        </p>
      </header>

      <div className="rounded-3xl border border-border bg-card p-5 sm:p-6 md:max-w-2xl">
        <AccountProfileForm
          initial={{
            email: profile.email,
            fullName: profile.fullName,
            dni: profile.dni,
            phone: profile.phone,
            avatarUrl: profile.avatarUrl,
          }}
        />
      </div>
    </section>
  )
}
