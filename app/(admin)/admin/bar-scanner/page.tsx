import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BarScanner } from "@/components/admin/bar-scanner"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Escáner de barra",
  description: "Validación rápida de consumiciones Tokepass.",
}

export default async function BarScannerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/bar-scanner")
  }

  return <BarScanner />
}
