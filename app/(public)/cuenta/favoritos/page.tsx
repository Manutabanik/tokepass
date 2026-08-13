import { Heart } from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"

import { listMyFavoriteEvents } from "@/app/actions/favorites"
import { FavoriteToggleButton } from "@/components/public/favorite-toggle-button"
import { Button } from "@/components/ui/button"
import { formatEventDay, formatEventTime } from "@/lib/format"

export const metadata: Metadata = {
  title: "Favoritos",
  description: "Eventos guardados para comprar después.",
}

export default async function CuentaFavoritosPage() {
  let favorites: Awaited<ReturnType<typeof listMyFavoriteEvents>> = []
  try {
    favorites = await listMyFavoriteEvents()
  } catch (error) {
    if (error instanceof Error && error.message === "auth_required") {
      redirect("/login?next=/cuenta/favoritos")
    }
    throw error
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-rose-300/90">
          Favoritos
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Favoritos
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Eventos que guardaste para comprar después.
        </p>
      </header>

      {favorites.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-14 text-center">
          <Heart className="mx-auto size-8 text-zinc-600" />
          <h2 className="mt-4 text-lg font-bold text-white">
            Todavía no tenés favoritos
          </h2>
          <p className="mt-2 text-sm text-zinc-500">
            Tocá el corazón en un evento para guardarlo acá.
          </p>
          <Button
            className="mt-6 min-h-12 rounded-xl"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            Explorar eventos
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {favorites.map((event) => (
            <li
              key={event.eventId}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
            >
              <Link href={`/events/${event.eventId}`} className="block">
                <div className="relative aspect-[16/10] bg-zinc-900">
                  {event.flyerUrl ? (
                    <Image
                      src={event.flyerUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 to-transparent" />
                </div>
                <div className="space-y-1 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    {formatEventDay(event.date)} · {formatEventTime(event.date)}
                  </p>
                  <h2 className="line-clamp-2 text-lg font-bold text-white">
                    {event.title}
                  </h2>
                  <p className="truncate text-sm text-zinc-500">
                    {event.location}
                  </p>
                </div>
              </Link>
              <div className="border-t border-white/8 px-4 py-3">
                <FavoriteToggleButton
                  eventId={event.eventId}
                  initiallyFavorited
                  size="pill"
                  className="w-full"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
