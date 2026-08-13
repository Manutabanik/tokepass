import { redirect } from "next/navigation"

/** Alias pedido por producto: /superadmin/liquidaciones */
export default function SuperAdminLiquidacionesAliasPage() {
  redirect("/superadmin/settlements")
}
