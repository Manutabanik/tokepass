import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  getPublicOrganizerProfile,
  getPublishedEventsByOrganizer,
} from "@/app/actions/public-events"
import { EventCard } from "@/components/discovery/event-card"
import { OrganizerAvatar } from "@/components/public/organizer-avatar"
import { ProducerFollowButton } from "@/components/public/producer-follow-button"
import { isEventUuid, publicProducerUrl } from "@/lib/seo/site"

export const revalidate = 60

type ProducerPageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params,
}: ProducerPageProps): Promise<Metadata> {
  const { id } = await params
  if (!isEventUuid(id)) {
    return { title: "Productora no encontrada" }
  }
  const profile = await getPublicOrganizerProfile(id)
  if (!profile) {
    return { title: "Productora no encontrada" }
  }
  const title = `${profile.name} | TokePass`
  const description =
    profile.bio?.trim() ||
    `Eventos y entradas oficiales de ${profile.name} en TokePass.`
  return {
    title,
    description,
    alternates: { canonical: publicProducerUrl(id) },
    openGraph: {
      title,
      description,
      url: publicProducerUrl(id),
      type: "profile",
      images: profile.avatarUrl ? [{ url: profile.avatarUrl }] : undefined,
    },
  }
}

export default async function PublicProducerPage({ params }: ProducerPageProps) {
  const { id } = await params
  if (!isEventUuid(id)) notFound()

  const [profile, events] = await Promise.all([
    getPublicOrganizerProfile(id),
    getPublishedEventsByOrganizer(id),
  ])
  if (!profile) notFound()

  const description =
    profile.bio?.trim() || "Productora en TokePass. Próximos eventos y entradas oficiales."
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.name,
    description,
    image: profile.avatarUrl || undefined,
    url: publicProducerUrl(id),
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f4f2f8] text-zinc-900 dark:bg-[#030712] dark:text-zinc-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <header className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 text-card-foreground sm:flex-row sm:items-center sm:gap-6 sm:p-6">
          <OrganizerAvatar
            name={profile.name}
            avatarUrl={profile.avatarUrl}
            className="size-16 text-base"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Productora
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {profile.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
          <ProducerFollowButton
            producerId={id}
            producerName={profile.name}
          />
        </header>

        <section className="mt-10">
          <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
            Próximos eventos
          </h2>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Esta productora no tiene shows publicados por ahora.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {events.map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={index}
                  priority={index < 2}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
