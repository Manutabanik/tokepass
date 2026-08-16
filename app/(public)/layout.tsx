import { PublicShell } from "@/components/layout/public-shell"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteFooterSafeSpace } from "@/components/layout/site-footer-safe-space"
import { SpotifyMiniPlayer } from "@/components/public/spotify-mini-player"
import { PublicNavbar } from "@/components/shared/public-navbar"

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <PublicShell
      navbar={<PublicNavbar />}
      footer={
        <>
          <SiteFooter />
          <SiteFooterSafeSpace />
          <SpotifyMiniPlayer />
        </>
      }
    >
      {children}
    </PublicShell>
  )
}
