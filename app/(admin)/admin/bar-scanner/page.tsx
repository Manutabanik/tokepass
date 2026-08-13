import { redirect } from "next/navigation"

/** Legacy alias → Escáner de Tienda */
export default function BarScannerAliasPage() {
  redirect("/admin/store-scanner")
}
