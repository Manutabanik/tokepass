"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  IdCard,
  Landmark,
  LoaderCircle,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useForm } from "react-hook-form"

import { submitOrganizerApplication } from "@/app/actions/organizer-kyb"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  organizerApplicationSchema,
  type OrganizerApplicationFormValues,
} from "@/lib/validations/organizer-application"
import { cn } from "@/lib/utils"

const defaultValues: OrganizerApplicationFormValues = {
  companyName: "",
  cuitCuil: "",
  responsibleDni: "",
  cbuAlias: "",
  socialMediaUrl: "",
}

export function OrganizerApplicationWizard({
  initialStatus,
}: {
  initialStatus: "pending" | "approved" | "rejected" | null
}) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<OrganizerApplicationFormValues>({
    resolver: zodResolver(organizerApplicationSchema),
    defaultValues,
    mode: "onBlur",
  })

  if (initialStatus === "pending" || done) {
    return (
      <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/10 px-6 py-10 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-400/30 dark:text-emerald-300">
          <CheckCircle2 className="size-7" aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-2xl font-black text-foreground">
          Solicitud enviada
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-emerald-800/80 dark:text-emerald-100/80">
          Nuestro equipo validará tu productora en menos de 24 horas. Te
          avisamos por email cuando puedas entrar a Tu Panel.
        </p>
        <Button
          nativeButton={false}
          render={<Link href="/" />}
          className="mt-8 rounded-full bg-white text-zinc-900 hover:bg-zinc-100"
        >
          Volver al inicio
        </Button>
      </div>
    )
  }

  if (initialStatus === "approved") {
    return (
      <div className="rounded-3xl border border-sky-500/25 bg-sky-500/10 px-6 py-10 text-center">
        <Building2 className="mx-auto size-8 text-sky-300" />
        <h2 className="mt-4 text-xl font-bold text-foreground">
          Tu productora ya está aprobada
        </h2>
        <p className="mt-2 text-sm text-sky-800/80 dark:text-sky-100/80">
          Ya podés gestionar eventos desde Tu Panel.
        </p>
        <Button
          nativeButton={false}
          render={<Link href="/admin" />}
          className="mt-6 rounded-full bg-violet-600 text-white hover:bg-violet-500"
        >
          Ir a Tu Panel
        </Button>
      </div>
    )
  }

  async function onSubmit(values: OrganizerApplicationFormValues) {
    setError(null)
    const result = await submitOrganizerApplication(values)
    if (!result.success) {
      setError(result.error)
      return
    }
    setDone(true)
  }

  async function goNext() {
    const fields =
      step === 0
        ? (["companyName", "socialMediaUrl"] as const)
        : (["cuitCuil", "responsibleDni", "cbuAlias"] as const)
    const ok = await form.trigger(fields)
    if (ok) setStep(1)
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6 rounded-3xl border border-border bg-card p-6 sm:p-8"
      >
        <div className="flex gap-2">
          {["Productora", "Datos fiscales"].map((label, index) => (
            <div
              key={label}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold",
                step === index
                  ? "bg-violet-500/20 text-violet-800 ring-1 ring-violet-400/30 dark:text-violet-200"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}. {label}
            </div>
          ))}
        </div>

        {step === 0 ? (
          <div className="space-y-5">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="inline-flex items-center gap-2">
                    <Building2 className="size-3.5" />
                    Nombre de la productora
                  </FormLabel>
                  <Input
                    {...field}
                    placeholder="Ej. Noches del Sur"
                    className="h-11"
                  />
                  <FormDescription>
                    Así va a figurar frente a compradores y en liquidaciones.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="socialMediaUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="inline-flex items-center gap-2">
                    <Globe className="size-3.5" />
                    Instagram o sitio web
                  </FormLabel>
                  <Input
                    {...field}
                    placeholder="https://instagram.com/tu_productora"
                    className="h-11"
                  />
                  <FormDescription>
                    Lo usamos para validar que la productora existe.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <FormField
              control={form.control}
              name="cuitCuil"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="inline-flex items-center gap-2">
                    <Landmark className="size-3.5" />
                    CUIT / CUIL
                  </FormLabel>
                  <Input
                    {...field}
                    inputMode="numeric"
                    placeholder="20-12345678-9"
                    className="h-11"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="responsibleDni"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="inline-flex items-center gap-2">
                    <IdCard className="size-3.5" />
                    DNI del responsable
                  </FormLabel>
                  <Input
                    {...field}
                    inputMode="numeric"
                    placeholder="Solo números"
                    className="h-11"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cbuAlias"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="inline-flex items-center gap-2">
                    <Landmark className="size-3.5" />
                    CBU o alias
                  </FormLabel>
                  <Input
                    {...field}
                    placeholder="Para retiros / liquidaciones"
                    className="h-11"
                  />
                  <FormDescription>
                    Acá te vamos a transferir la recaudación cuando pidas un
                    retiro.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {step === 0 ? (
            <Button
              type="button"
              variant="ghost"
              nativeButton={false}
              render={<Link href="/" />}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft />
              Cancelar
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(0)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft />
              Anterior
            </Button>
          )}

          {step === 0 ? (
            <Button
              type="button"
              onClick={() => void goNext()}
              className="bg-violet-600 text-white hover:bg-violet-500"
            >
              Continuar
              <ArrowRight />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {form.formState.isSubmitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Enviar solicitud
            </Button>
          )}
        </div>
      </form>
    </Form>
  )
}
