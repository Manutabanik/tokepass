import { SiteFooter } from "@/components/layout/site-footer"
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav"
import { SpotifyMiniPlayer } from "@/components/public/spotify-mini-player"
import { PublicNavbar } from "@/components/shared/public-navbar"

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="relative flex-1 pb-20 lg:pb-0">{children}</main>
      <SiteFooter />
      <SpotifyMiniPlayer />
      <MobileBottomNav />
    </div>
  )
}
