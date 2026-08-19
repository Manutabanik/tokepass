import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { StoreScanner } from "@/components/admin/bar-scanner"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Escáner de Tienda / Canjes",
  description: "Validación de extras y productos TokePass.",
}

export default async function StoreScannerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/store-scanner")
  }

  return <StoreScanner />
}
