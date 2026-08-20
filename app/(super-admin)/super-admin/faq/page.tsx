import { redirect } from "next/navigation"

/** Alias canónico: /super-admin/faq → CRUD en Super Admin */
export default function SuperAdminFaqAliasPage() {
  redirect("/superadmin/faq")
}
