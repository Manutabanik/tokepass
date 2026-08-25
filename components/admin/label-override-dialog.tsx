"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LabelOverrideDialog({
  open,
  value,
  onValueChange,
  onOpenChange,
  onSave,
}: {
  open: boolean
  value: string
  onValueChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg border-border bg-card text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Etiqueta de este elemento</DialogTitle>
          <DialogDescription>
            Cambia solo esta butaca o mesa. El resto de la fila conserva su
            numeración.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="label-override">Texto</Label>
          <Input
            id="label-override"
            autoFocus
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSave()
            }}
            placeholder="Ej. Silla de Ruedas"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSave} disabled={!value.trim()}>
            Guardar excepción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
