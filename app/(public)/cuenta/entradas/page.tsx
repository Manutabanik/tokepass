import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { DigitalWalletScreen } from "@/components/account/digital-wallet-screen"
import { loginUrlWithNext } from "@/lib/auth/post-login"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Mis entradas",
  description:
    "Mis entradas TokePass: donde guardás tus pases, incluso sin señal.",
}

export default async function CuentaEntradasPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(loginUrlWithNext("/cuenta/entradas"))
  }

  return (
    <DigitalWalletScreen userId={user.id} loginNext="/cuenta/entradas" />
  )
}
