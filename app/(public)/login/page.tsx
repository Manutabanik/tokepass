import type { Metadata } from "next"

import { AuthForms } from "@/components/shared/auth-forms"

export const metadata: Metadata = {
  title: "Ingresar",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-16">
      <AuthForms initialError={error} nextPath={next} />
    </section>
  )
}
