import { redirect } from "next/navigation"

/** Alias: /admin/payouts → Recaudación y Retiros */
export default function AdminPayoutsAliasPage() {
  redirect("/admin/finances")
}
