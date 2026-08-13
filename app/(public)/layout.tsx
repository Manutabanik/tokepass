import { PublicNavbar } from "@/components/shared/public-navbar"

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-[#f4f2f8] text-zinc-900 dark:bg-[#030712] dark:text-zinc-100">
      <PublicNavbar />
      <main>{children}</main>
    </div>
  )
}
