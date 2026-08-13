import { redirect } from "next/navigation"

/** Alias: Usuarios → Compradores */
export default function SuperAdminUsersAliasPage() {
  redirect("/superadmin/buyers")
}
