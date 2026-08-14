import type { Metadata } from "next"

import { AuthForms } from "@/components/shared/auth-forms"

export const metadata: Metadata = {
  title: "Crear cuenta",
}

export default function RegisterPage() {
  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center overflow-hidden bg-background px-4 py-16">
      <AuthForms initialMode="register" />
    </section>
  )
}
