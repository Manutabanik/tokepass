import { redirect } from "next/navigation"

/** Alias canónico pedido por producto: /super-admin → Platform OS */
export default function SuperAdminAliasPage() {
  redirect("/superadmin")
}
