"use client"

import { LoaderCircle, Megaphone, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  updateEventMarketingSettings,
  type EventMarketingSettings,
} from "@/app/actions/event-marketing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function EventMarketingPixelsForm({
  initial,
}: {
  initial: EventMarketingSettings
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [metaEnabled, setMetaEnabled] = useState(initial.metaPixelEnabled)
  const [metaId, setMetaId] = useState(initial.metaPixelId ?? "")
  const [tiktokEnabled, setTiktokEnabled] = useState(initial.tiktokPixelEnabled)
  const [tiktokId, setTiktokId] = useState(initial.tiktokPixelId ?? "")
  const [ga4Enabled, setGa4Enabled] = useState(initial.ga4Enabled)
  const [ga4Id, setGa4Id] = useState(initial.ga4MeasurementId ?? "")

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateEventMarketingSettings(initial.eventId, {
        metaPixelId: metaId,
        metaPixelEnabled: metaEnabled,
        tiktokPixelId: tiktokId,
        tiktokPixelEnabled: tiktokEnabled,
        ga4MeasurementId: ga4Id,
        ga4Enabled: ga4Enabled,
      })
      if (!result.success) {
        toast.error("No se pudo guardar", { description: result.error })
        return
      }
      setMetaEnabled(result.data.metaPixelEnabled)
      setMetaId(result.data.metaPixelId ?? "")
      setTiktokEnabled(result.data.tiktokPixelEnabled)
      setTiktokId(result.data.tiktokPixelId ?? "")
      setGa4Enabled(result.data.ga4Enabled)
      setGa4Id(result.data.ga4MeasurementId ?? "")
      toast.success("Píxeles actualizados", {
        description: "Se aplican en la ficha pública y en el checkout.",
      })
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950/70 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-sky-500/15 text-sky-600 ring-1 ring-sky-500/30 dark:text-sky-300">
          <Megaphone className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
            Píxeles de marketing
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Medí ViewContent, AddToCart, InitiateCheckout y Purchase en Meta,
            TikTok y Google Analytics 4. Solo se inyectan si el interruptor está
            activo y el ID es válido.
          </p>
        </div>
      </div>

      <PixelField
        title="Meta Pixel"
        description="Facebook / Instagram Ads · ID numérico"
        enabled={metaEnabled}
        onEnabledChange={setMetaEnabled}
        idValue={metaId}
        onIdChange={setMetaId}
        placeholder="123456789012345"
        inputId="meta-pixel-id"
        disabled={pending}
      />

      <PixelField
        title="TikTok Pixel"
        description="TikTok Ads · Pixel ID"
        enabled={tiktokEnabled}
        onEnabledChange={setTiktokEnabled}
        idValue={tiktokId}
        onIdChange={setTiktokId}
        placeholder="CABCDEF1234567890"
        inputId="tiktok-pixel-id"
        disabled={pending}
      />

      <PixelField
        title="Google Analytics 4"
        description="Measurement ID · formato G-XXXXXXXX"
        enabled={ga4Enabled}
        onEnabledChange={setGa4Enabled}
        idValue={ga4Id}
        onIdChange={setGa4Id}
        placeholder="G-XXXXXXXX"
        inputId="ga4-measurement-id"
        disabled={pending}
      />

      <Button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Guardando…
          </>
        ) : (
          <>
            <Save className="size-4" aria-hidden />
            Guardar píxeles
          </>
        )}
      </Button>
    </form>
  )
}

function PixelField({
  title,
  description,
  enabled,
  onEnabledChange,
  idValue,
  onIdChange,
  placeholder,
  inputId,
  disabled,
}: {
  title: string
  description: string
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  idValue: string
  onIdChange: (value: string) => void
  placeholder: string
  inputId: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-zinc-900 dark:text-white">{title}</p>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-zinc-400">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onEnabledChange}
          disabled={disabled}
          aria-label={`Activar ${title}`}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>ID</Label>
        <Input
          id={inputId}
          value={idValue}
          onChange={(event) => onIdChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled || !enabled}
          className="border-zinc-300 bg-zinc-50 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
