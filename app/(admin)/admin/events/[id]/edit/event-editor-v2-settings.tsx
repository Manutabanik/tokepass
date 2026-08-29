"use client"

import { Eye } from "lucide-react"
import { Controller, useFormContext } from "react-hook-form"

import {
  DRAFT_TEXTAREA_CLASS,
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
    <div className="space-y-4">
      <Controller
        name="settings.isPublic"
        control={control}
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 px-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Eye className="size-4 text-emerald-400" aria-hidden />
                <Label
                  htmlFor="event-v2-is-public"
                  className="text-sm font-medium text-foreground"
                >
                  ¿Sale en el catálogo?
                </Label>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {field.value
                  ? "Sí: aparece en Tokepass cuando lo subas al catálogo."
                  : "No: solo lo ven quienes tengan el link."}
              </p>
            </div>
            <Switch
              id="event-v2-is-public"
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              className="mt-0.5 shrink-0 data-checked:bg-emerald-500"
              aria-label="¿Sale en el catálogo?"
            />
          </div>
        )}
      />

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
    </div>
  )
}
