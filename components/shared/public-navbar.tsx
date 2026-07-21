import { Search, Ticket, UserRound } from "lucide-react"
import Link from "next/link"

import { BrandLogo } from "@/components/shared/brand-logo"
import { SignOutButton } from "@/components/shared/sign-out-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/server"

export async function PublicNavbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLogo inverted className="shrink-0" />

        <form
          action="/"
          className="relative ml-auto hidden w-full max-w-md md:block"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <Input
            name="q"
            type="search"
            placeholder="Buscar eventos"
            aria-label="Buscar eventos"
            className="h-10 rounded-full border-zinc-800 bg-zinc-900/80 pl-10 text-zinc-100 placeholder:text-zinc-500"
          />
        </form>

        {user ? (
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <Button
              variant="ghost"
              size="lg"
              className="rounded-full text-zinc-300 hover:bg-white/5 hover:text-white"
              nativeButton={false}
              render={<Link href="/my-tickets" />}
            >
              <Ticket aria-hidden="true" />
              <span className="hidden sm:inline">Mis entradas</span>
            </Button>
            <SignOutButton />
          </div>
        ) : (
          <Button
            variant="ghost"
            size="lg"
            className="ml-auto rounded-full text-zinc-300 hover:bg-white/5 hover:text-white md:ml-0"
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
