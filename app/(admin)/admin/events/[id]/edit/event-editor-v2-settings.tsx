"use client"

import { Eye, MessageSquareText, Receipt, Shield } from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"

import { DraftCard, DraftFieldError } from "./event-editor-v2-ui"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { EventDraftV2 } from "@/lib/validations/event-draft-v2"

export function EventEditorV2SettingsStep() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<EventDraftV2>()

  return (
    <div className="space-y-5">
      <Controller
        name="settings.isPublic"
        control={control}
        render={({ field }) => (
          <SettingToggle
            id="event-v2-is-public"
            icon={Eye}
            title="Visibilidad del evento"
            description={
              field.value
                ? "Público: visible en el catálogo cuando se publique."
                : "Privado: no aparece en el catálogo."
            }
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />

      <Controller
        name="settings.absorbFees"
        control={control}
        render={({ field }) => (
          <SettingToggle
            id="event-v2-absorb-fees"
            icon={Receipt}
            title="Absorber cargos"
            description="Tú pagas el costo del servicio, el cliente ve el precio final limpio."
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />

      <DraftCard>
        <div className="mb-4 flex items-center gap-2">
          <Shield className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Política de devoluciones
          </h2>
        </div>
        <div className="grid gap-2">
          <Label
            htmlFor="event-v2-refund-policy"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Condiciones para el comprador
          </Label>
          <Textarea
            id="event-v2-refund-policy"
            rows={5}
            placeholder="Ej. No se aceptan devoluciones. Cambio de titular hasta 24 h antes."
            {...register("settings.refundPolicy")}
          />
          <DraftFieldError message={errors.settings?.refundPolicy?.message} />
        </div>
      </DraftCard>

      <DraftCard>
        <div className="mb-4 flex items-center gap-2">
          <MessageSquareText className="size-4 text-emerald-400" aria-hidden />
          <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
            Mensaje post-compra
          </h2>
        </div>
        <div className="grid gap-2">
          <Label
            htmlFor="event-v2-checkout-message"
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            Texto al finalizar la compra
          </Label>
          <Textarea
            id="event-v2-checkout-message"
            rows={4}
            placeholder="Ej. Gracias por tu compra. Revisá el mail para el acceso."
            {...register("settings.checkoutMessage")}
          />
          <DraftFieldError message={errors.settings?.checkoutMessage?.message} />
        </div>
      </DraftCard>
    </div>
  )
}

function SettingToggle({
  id,
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  id: string
  icon: typeof Eye
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <DraftCard className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-emerald-400" aria-hidden />
          <Label
            htmlFor={id}
            className="text-sm font-bold text-slate-800 dark:text-zinc-200"
          >
            {title}
          </Label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-checked:bg-emerald-500"
        aria-label={title}
      />
    </DraftCard>
  )
}
