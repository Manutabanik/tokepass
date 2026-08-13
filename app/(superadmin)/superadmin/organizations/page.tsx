import { redirect } from "next/navigation"

/** Alias: listado legacy → Productoras aprobadas */
export default function SuperAdminOrganizationsAliasPage() {
  redirect("/superadmin/organizers")
}
