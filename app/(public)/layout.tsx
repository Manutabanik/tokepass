import { PublicNavbar } from "@/components/shared/public-navbar"

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">
      <PublicNavbar />
      <main>{children}</main>
    </div>
  )
}
