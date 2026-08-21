"use client"

import { LogIn, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function CheckoutIdentityDialog({
  open,
  pending = false,
  onOpenChange,
  onLogin,
  onGuest,
}: {
  open: boolean
  pending?: boolean
  onOpenChange: (open: boolean) => void
  onLogin: () => void
  onGuest: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        overlayClassName="isolate z-[100]"
        className="z-[100] border-border bg-card text-card-foreground sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            Ingresá o continuá como invitado
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            El mapa se abre ahora. Nombre, DNI y teléfono se piden recién al
            confirmar el pago.
          </DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
          <UserRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          Si seguís como invitado, tu selección queda en este dispositivo y te
          pedimos los datos al pagar.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={pending}
            className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground hover:bg-primary/90"
            onClick={onLogin}
          >
            <LogIn className="size-4" aria-hidden="true" />
            Ingresar a mi cuenta
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            className="h-12 w-full rounded-xl"
            onClick={onGuest}
          >
            <UserRound className="size-4" aria-hidden="true" />
            Continuar como invitado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
