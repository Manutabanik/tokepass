import { redirect } from "next/navigation"

/** Alias legacy → perfil del comprador (no confundir con /admin/profile) */
export default function ProfileAliasPage() {
  redirect("/cuenta/perfil")
}
