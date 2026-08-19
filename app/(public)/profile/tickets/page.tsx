import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { DigitalWalletScreen } from "@/components/account/digital-wallet-screen"
import { loginUrlWithNext } from "@/lib/auth/post-login"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Mis entradas",
  description:
    "Billetera digital TokePass: Living QR, transferencias y reclamo seguro.",
}

export default async function ProfileTicketsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(loginUrlWithNext("/profile/tickets"))
  }

  return (
    <DigitalWalletScreen userId={user.id} loginNext="/profile/tickets" />
  )
}
