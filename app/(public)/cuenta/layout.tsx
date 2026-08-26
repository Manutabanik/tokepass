import { AccountPortalLayout } from "@/components/account/account-portal-layout"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

export default function CuentaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AccountPortalLayout loginNext="/cuenta">{children}</AccountPortalLayout>
  )
}
