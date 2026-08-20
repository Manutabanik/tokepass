"use client"

import { LoaderCircle } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function TransferShareConfirmDialog({
  open,
  onOpenChange,
  eventTitle,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventTitle: string
  pending: boolean
  onConfirm: () => void
}) {
  const checkboxId = useId()
  const [accepted, setAccepted] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) setAccepted(false)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        role="alertdialog"
        className="sm:max-w-md"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>Enviar entrada a un amigo</DialogTitle>
          <DialogDescription>
            Cesión de tu acceso a{" "}
            <span className="font-medium text-foreground">{eventTitle}</span>.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm leading-6 text-muted-foreground">
          Se generará un link único. Por seguridad, este link caducará en 24
          horas. Podrás cancelar el envío desde tu panel en cualquier momento
          antes de que tu amigo lo reclame.
        </p>

        <label
          htmlFor={checkboxId}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition",
            accepted && "border-primary/40 bg-primary/5",
            pending && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={accepted}
            disabled={pending}
            required
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-primary"
          />
          <span className="text-xs leading-5 text-muted-foreground">
            Entiendo que quien abra este link se adueñará de la entrada.
            TokePass no se responsabiliza por acuerdos de pago externos
            relacionados a esta transferencia.
          </span>
        </label>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending || !accepted}
            onClick={onConfirm}
            className="rounded-xl bg-green-600 text-white hover:bg-green-700"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            Generar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
