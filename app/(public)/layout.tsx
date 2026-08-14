import { PublicNavbar } from "@/components/shared/public-navbar"

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />
      <main>{children}</main>
    </div>
  )
}
