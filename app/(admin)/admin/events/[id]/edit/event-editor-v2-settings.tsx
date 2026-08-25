"use client"

import { Eye, MessageSquareText, Shield } from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"

import {
  DRAFT_TEXTAREA_CLASS,
  DraftCard,
  DraftFieldError,
  DraftFieldLabel,
  DraftHint,
} from "./event-editor-v2-ui"
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
    <div className="space-y-6">
      <Controller
        name="settings.isPublic"
        control={control}
        render={({ field }) => (
          <SettingToggle
            id="event-v2-is-public"
            icon={Eye}
            title="¿Sale en el catálogo?"
            description={
              field.value
                ? "Sí: aparece en Tokepass cuando lo subas al catálogo."
                : "No: solo lo ven quienes tengan el link."
            }
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        )}
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DraftCard>
          <div className="mb-4 flex items-center gap-2">
            <Shield className="size-4 text-emerald-400" aria-hidden />
            <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
              Política de devoluciones
            </h2>
          </div>
          <div className="grid gap-2">
            <DraftFieldLabel
              htmlFor="event-v2-refund-policy"
              optional
              className="text-sm"
            >
              ¿Cómo son las devoluciones?
            </DraftFieldLabel>
            <Textarea
              id="event-v2-refund-policy"
              rows={5}
              className={DRAFT_TEXTAREA_CLASS}
              placeholder="Ej. No se aceptan devoluciones. Cambio de titular hasta 24 h antes."
              {...register("settings.refundPolicy")}
            />
            <DraftHint>Se muestra antes de pagar. Podés dejarlo vacío.</DraftHint>
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
            <DraftFieldLabel
              htmlFor="event-v2-checkout-message"
              optional
              className="text-sm"
            >
              Mensaje después de pagar
            </DraftFieldLabel>
            <Textarea
              id="event-v2-checkout-message"
              rows={5}
              className={DRAFT_TEXTAREA_CLASS}
              placeholder="Ej. Gracias por tu compra. Revisá el mail para el acceso."
              {...register("settings.checkoutMessage")}
            />
            <DraftHint>Aparece en la pantalla de éxito después del pago.</DraftHint>
            <DraftFieldError message={errors.settings?.checkoutMessage?.message} />
          </div>
        </DraftCard>
      </div>
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
    <DraftCard className="flex h-full items-center justify-between gap-4">
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
