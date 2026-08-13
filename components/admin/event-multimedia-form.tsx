"use client"

import { ImagePlus, Loader2, Share2, Trash2, Video } from "lucide-react"
import Image from "next/image"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  removeEventGalleryImage,
  removeEventSocialShareImage,
  updateEventMultimediaSettings,
  uploadEventGalleryImage,
  uploadEventSocialShareImage,
  type EventMultimediaSettings,
} from "@/app/actions/event-multimedia"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isValidPromoVideoUrl } from "@/lib/promo-video"
import { cn } from "@/lib/utils"

const MAX_GALLERY = 4
const MAX_BYTES = 2 * 1024 * 1024
const MAX_STORY_BYTES = 3 * 1024 * 1024

export function EventMultimediaForm({
  initial,
}: {
  initial: EventMultimediaSettings
}) {
  const [promoVideoUrl, setPromoVideoUrl] = useState(
    initial.promoVideoUrl ?? "",
  )
  const [galleryUrls, setGalleryUrls] = useState(initial.galleryUrls)
  const [socialShareImageUrl, setSocialShareImageUrl] = useState(
    initial.socialShareImageUrl,
  )
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [uploadingStory, setUploadingStory] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const storyFileRef = useRef<HTMLInputElement>(null)

  function saveVideo() {
    const trimmed = promoVideoUrl.trim()
    if (trimmed && !isValidPromoVideoUrl(trimmed)) {
      toast.error("Usá un link válido de YouTube o Vimeo.")
      return
    }

    startTransition(async () => {
      const result = await updateEventMultimediaSettings(initial.eventId, {
        promoVideoUrl: trimmed || null,
        galleryUrls,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setPromoVideoUrl(result.data.promoVideoUrl ?? "")
      setGalleryUrls(result.data.galleryUrls)
      setSocialShareImageUrl(result.data.socialShareImageUrl)
      toast.success("Multimedia guardada.")
    })
  }

  async function onPickFile(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    if (fileRef.current) fileRef.current.value = ""

    if (galleryUrls.length >= MAX_GALLERY) {
      toast.error(`Máximo ${MAX_GALLERY} fotos.`)
      return
    }
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Solo PNG, JPG o WEBP.")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("Cada imagen debe pesar como máximo 2 MB.")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.set("image", file)
      const result = await uploadEventGalleryImage(initial.eventId, formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setGalleryUrls((current) => [...current, result.data.url].slice(0, MAX_GALLERY))
      toast.success("Foto agregada a la galería.")
    } finally {
      setUploading(false)
    }
  }

  async function onPickStoryFile(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    if (storyFileRef.current) storyFileRef.current.value = ""

    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Solo PNG, JPG o WEBP.")
      return
    }
    if (file.size > MAX_STORY_BYTES) {
      toast.error("La imagen de Stories debe pesar como máximo 3 MB.")
      return
    }

    setUploadingStory(true)
    try {
      const formData = new FormData()
      formData.set("image", file)
      const result = await uploadEventSocialShareImage(initial.eventId, formData)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSocialShareImageUrl(result.data.socialShareImageUrl)
      toast.success("Flyer de Stories actualizado.")
    } finally {
      setUploadingStory(false)
    }
  }

  function removeImage(url: string) {
    startTransition(async () => {
      const result = await removeEventGalleryImage(initial.eventId, url)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setGalleryUrls(result.data.galleryUrls)
      toast.success("Foto eliminada.")
    })
  }

  function removeStoryImage() {
    startTransition(async () => {
      const result = await removeEventSocialShareImage(initial.eventId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setSocialShareImageUrl(null)
      toast.success("Flyer de Stories eliminado. Se usará el fallback automático.")
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-950/70 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
            <Video className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Spot promocional
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Pegá un link de YouTube o Vimeo. No subimos video a Storage: cero
              costo de hosting multimedia.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="promo-video-url">URL del video</Label>
          <Input
            id="promo-video-url"
            type="url"
            value={promoVideoUrl}
            onChange={(event) => setPromoVideoUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=… o https://vimeo.com/…"
            className="h-11"
          />
        </div>

        <Button
          type="button"
          onClick={saveVideo}
          disabled={pending || uploading || uploadingStory}
          className="rounded-full"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Guardando…
            </>
          ) : (
            "Guardar spot"
          )}
        </Button>
      </section>

      <section
        id="flyer-historias"
        className="scroll-mt-24 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-950/70 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300">
            <Share2 className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Flyer para Historias (Post-Compra)
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Subí un diseño en formato vertical (1080 x 1920 px - ratio 9:16).
              Esta es la imagen que tus clientes compartirán en Instagram cuando
              compren su entrada. Si no subís nada, armaremos una automáticamente
              usando tu flyer principal.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="relative mx-auto aspect-[9/16] w-40 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-zinc-900 sm:mx-0">
            {socialShareImageUrl ? (
              <>
                <Image
                  src={socialShareImageUrl}
                  alt="Flyer de Stories"
                  fill
                  sizes="160px"
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={removeStoryImage}
                  disabled={pending || uploadingStory}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-zinc-950/80 text-white"
                  aria-label="Eliminar flyer de Stories"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={uploadingStory || pending}
                onClick={() => storyFileRef.current?.click()}
                className={cn(
                  "flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center",
                  "text-zinc-600 transition hover:bg-fuchsia-50 dark:text-zinc-400 dark:hover:bg-zinc-900",
                )}
              >
                {uploadingStory ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImagePlus className="size-5" />
                )}
                <span className="text-xs font-medium">
                  {uploadingStory ? "Subiendo…" : "Subir 9:16"}
                </span>
              </button>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center gap-3">
            <p className="text-xs text-zinc-500">
              Máx. 3 MB · PNG, JPG o WEBP · recomendado 1080×1920.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={uploadingStory || pending}
              onClick={() => storyFileRef.current?.click()}
              className="w-full rounded-full sm:w-auto"
            >
              {uploadingStory ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Subiendo…
                </>
              ) : socialShareImageUrl ? (
                "Reemplazar imagen"
              ) : (
                "Elegir imagen"
              )}
            </Button>
          </div>
        </div>

        <input
          ref={storyFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void onPickStoryFile(event.target.files)}
        />
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-950/70 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
            <ImagePlus className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              Galería · La Experiencia
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Hasta {MAX_GALLERY} fotos · máx. 2 MB c/u (PNG, JPG o WEBP).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {galleryUrls.map((url) => (
            <div
              key={url}
              className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-zinc-900"
            >
              <Image
                src={url}
                alt="Foto de galería"
                fill
                sizes="160px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(url)}
                disabled={pending}
                className={cn(
                  "absolute right-2 top-2 grid size-8 place-items-center rounded-full",
                  "bg-zinc-950/80 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100",
                )}
                aria-label="Eliminar foto"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          {galleryUrls.length < MAX_GALLERY ? (
            <button
              type="button"
              disabled={uploading || pending}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed",
                "border-zinc-300 bg-zinc-50 text-zinc-600 transition hover:border-violet-400 hover:bg-violet-50",
                "dark:border-white/15 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-violet-400/50 dark:hover:bg-zinc-900",
              )}
            >
              {uploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ImagePlus className="size-5" />
              )}
              <span className="text-xs font-medium">
                {uploading ? "Subiendo…" : "Agregar"}
              </span>
            </button>
          ) : null}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void onPickFile(event.target.files)}
        />
      </section>
    </div>
  )
}
