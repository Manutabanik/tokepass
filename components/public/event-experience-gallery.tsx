import { Images } from "lucide-react"
import Image from "next/image"

export function EventExperienceGallery({ urls }: { urls: string[] }) {
  const photos = urls.filter(Boolean).slice(0, 4)
  if (photos.length === 0) return null

  return (
    <section className="space-y-4" aria-labelledby="experience-gallery-title">
      <div className="flex items-center gap-2">
        <Images className="size-5 text-muted-foreground" aria-hidden="true" />
        <h2
          id="experience-gallery-title"
          className="text-lg font-bold tracking-tight text-foreground"
        >
          La Experiencia
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Miradas del evento · sin frenar tu compra.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {photos.map((url, index) => (
          <div
            key={url}
            className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted"
          >
            <Image
              src={url}
              alt={`Galería del evento ${index + 1}`}
              fill
              sizes="(max-width: 768px) 50vw, 320px"
              loading="lazy"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  )
}
