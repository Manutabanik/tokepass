"use client"

import { Check, HelpCircle, MousePointer } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const STEPS = [
  {
    title: "Paso 1: Elegir o cargar plantilla",
    body: "Elegí un modelo listo (Teatro, Anfiteatro, Peña) o empezá con el lienzo en blanco. El botón Plantillas está arriba a la derecha.",
  },
  {
    title: "Paso 2: Acomodar el llenado con el mouse",
    body: "Arrastrá mesas o tablones desde la izquierda hasta el lugar del salón. Clic izquierdo selecciona. Clic derecho abre acciones: duplicar, girar o borrar.",
  },
  {
    title: "Paso 3: Poner precios por sector",
    body: "Hacé clic en una mesa, butaca o sector y asigná el valor en la tarjeta flotante o en el panel de la derecha.",
  },
  {
    title: "Paso 4: Probar y publicar",
    body: "Hacé clic en Vista Previa del Comprador para ver cómo lo ve el cliente. Si está bien, guardá los cambios.",
  },
] as const

export function VenueSetupGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        className="bg-card border-primary/30"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <HelpCircle className="mr-2 h-4 w-4 text-emerald-400" />
        ¿Cómo configurar tu mapa?
      </Button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <MousePointer className="size-4 text-emerald-500" />
            Guía rápida del recinto
          </p>
          <ol className="mt-3 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
            Todo se puede hacer con el mouse. Los atajos de teclado quedan para quien ya los usa.
          </p>
        </div>
      ) : null}
    </div>
  )
}
