"use client"

import { LogIn, LogOut } from "lucide-react"
import { useEffect, useRef } from "react"

import { VenueSectorColorPicker } from "@/components/admin/venue-sector-color-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { VenueMapZone } from "@/types/venue-map"

/**
 * Propiedades de una zona: identidad y nada más.
 *
 * El inventario de la zona son las mesas y sillas que se colocan adentro, así
 * que se declara entrando al sector y distribuyéndolas sobre el plano, no
 * escribiendo filas y columnas en un formulario.
 */
export function VenueZoneBasicsPanel({
  zone,
  onChange,
  onEnterZone,
  onExitZone,
  inside = false,
  autoFocusName = false,
}: {
  zone: VenueMapZone
  onChange: (patch: Partial<VenueMapZone>) => void
  onEnterZone: () => void
  onExitZone: () => void
  /** El lienzo ya está aislado en esta zona. */
  inside?: boolean
  autoFocusName?: boolean
}) {
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocusName) return
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [autoFocusName, zone.id])

  return (
    <div className="space-y-3">
      <Field label="Nombre del Sector">
        <Input
          ref={nameRef}
          value={zone.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Campo Delantero, VIP Standing, Platea Sur"
        />
      </Field>
      <Field label="Color del Sector">
        <VenueSectorColorPicker
          value={zone.color}
          onChange={(color) => onChange({ color })}
        />
      </Field>
      {inside ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-12 w-full"
          onClick={onExitZone}
        >
          <LogOut className="size-4" />
          Salir del sector
        </Button>
      ) : (
        <Button
          type="button"
          className="min-h-12 w-full bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-500"
          onClick={onEnterZone}
        >
          <LogIn className="size-4" />
          Ingresar y distribuir sector
        </Button>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {inside
          ? "Arrastrá mesas, tablones o butacas desde la paleta: cada pieza que sueltes queda dentro de este sector."
          : "Abre el sector solo y encuadrado para colocar adentro las mesas, tablones o butacas que se venden."}
      </p>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
