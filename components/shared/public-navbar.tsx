import { LogOut, Search, UserRound } from "lucide-react"
import Link from "next/link"

import { signOut } from "@/app/actions/auth"
import { BrandLogo } from "@/components/shared/brand-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/server"

export async function PublicNavbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLogo className="shrink-0" />

        <form
          action="/events"
          className="relative ml-auto hidden w-full max-w-md md:block"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            name="q"
            type="search"
            placeholder="Busca eventos, artistas o ciudades"
            aria-label="Buscar eventos"
            className="h-10 rounded-full border-zinc-200 bg-zinc-50 pl-10"
          />
        </form>

        {user ? (
          <form action={signOut} className="ml-auto md:ml-0">
            <Button
              type="submit"
              variant="ghost"
              size="lg"
              className="rounded-full"
            >
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="lg"
            className="ml-auto rounded-full md:ml-0"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            <UserRound aria-hidden="true" />
            <span className="hidden sm:inline">Ingresar</span>
          </Button>
        )}
      </div>
    </header>
  )
}
