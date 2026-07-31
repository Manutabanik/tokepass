"use client"

import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner"
import {
  CameraOff,
  CheckCircle2,
  CloudUpload,
  Download,
  Gift,
  LoaderCircle,
  Monitor,
  ScanLine,
  Search,
  ShieldAlert,
  Smartphone,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"

import { EmergencyTicketSearch } from "@/components/admin/emergency-ticket-search"
import { TotemValidatorView } from "@/components/admin/totem-validator-view"
import {
  fetchEventTicketManifest,
  getScannerEvents,
  scanAndValidateTicket,
  syncOfflineScansBatch,
  type ScannerEventOption,
  type ScanTicketResult,
} from "@/app/actions/scanner"
import { logger } from "@/lib/logger"
import {
  readScannerAccessMode,
  writeScannerAccessMode,
  type ScannerAccessMode,
} from "@/lib/scanner/access-mode"
import { configureZxingWasm } from "@/lib/scanner/configure-zxing"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOnlineStatus } from "@/components/pwa/use-online-status"
import { useHardwareSignal } from "@/hooks/use-hardware-signal"
import {
  clearSyncQueueItems,
  downloadEventManifest,
  getManifestMeta,
  getSyncQueue,
  getSyncQueueCount,
  getTicketById,
  getTicketBySecret,
  markTicketUsedLocally,
  type ScannerManifestMeta,
  type ScannerManifestTicket,
} from "@/lib/offline-scanner-store"
import {
  assertLivingMac,
  resolveScanSecret,
} from "@/lib/scan-payload"
import { cn } from "@/lib/utils"

type VisualState = "idle" | "success" | "error" | "warn"

type Feedback = {
  title: string
  subtitle?: string
  bonus?: string | null
  isFreePass?: boolean
}

function formatScanTime(isoOrMs: string | number | null | undefined): string {
  if (isoOrMs == null) return "—"
  try {
    const date =
      typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs)
    return date.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  } catch {
    return "—"
  }
}

const ERROR_TITLES: Record<string, string> = {
  expired_qr: "QR EXPIRADO",
  already_used: "YA USADO",
  revoked: "REVOCADO",
  transferred: "ENTRADA TRANSFERIDA",
  cancelled: "CANCELADA",
  wrong_event: "EVENTO INCORRECTO",
  wrong_day: "JORNADA INCORRECTA",
  not_found: "NO ENCONTRADO",
  invalid_payload: "QR INVÁLIDO",
  forbidden: "SIN PERMISO",
  auth_required: "SIN SESIÓN",
  update_failed: "ERROR",
  unpaid: "SIN PAGO",
}

function playTone(kind: "success" | "error" | "warn") {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.type = "sine"
    oscillator.frequency.value =
      kind === "success" ? 880 : kind === "warn" ? 520 : 220
    gain.gain.value = 0.09
    oscillator.start()
    oscillator.stop(
      context.currentTime +
        (kind === "success" ? 0.16 : kind === "warn" ? 0.28 : 0.35),
    )
  } catch {
    // Audio opcional
  }
}

function vibrate(kind: "success" | "error" | "warn") {
  try {
    if (!navigator.vibrate) return
    if (kind === "success") navigator.vibrate([30, 20, 30])
    else if (kind === "warn") navigator.vibrate([80])
    else navigator.vibrate([120, 40, 120])
  } catch {
    // optional
  }
}

export function DoorScanner() {
  const online = useOnlineStatus()
  const { sendSignal } = useHardwareSignal()
  const [accessMode, setAccessMode] = useState<ScannerAccessMode>("guard")
  const isTotemMode = accessMode === "totem"
  const [events, setEvents] = useState<ScannerEventOption[]>([])
  const [eventId, setEventId] = useState<string>("")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [visual, setVisual] = useState<VisualState>("idle")
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [isPending, startTransition] = useTransition()
  const [manifestMeta, setManifestMeta] = useState<ScannerManifestMeta | null>(
    null,
  )
  const [queueCount, setQueueCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const cooldownRef = useRef(false)
  const resetTimerRef = useRef<number | null>(null)
  const isTotemModeRef = useRef(isTotemMode)
  isTotemModeRef.current = isTotemMode

  useEffect(() => {
    setAccessMode(readScannerAccessMode())
  }, [])

  useEffect(() => {
    if (isTotemMode) return
    configureZxingWasm()
  }, [isTotemMode])

  const setAccessModeAndPersist = useCallback((mode: ScannerAccessMode) => {
    setAccessMode(mode)
    writeScannerAccessMode(mode)
    setCameraError(null)
    setVisual("idle")
    setFeedback(null)
    cooldownRef.current = false
  }, [])

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId) ?? null,
    [events, eventId],
  )

  const hasLocalManifest = Boolean(manifestMeta)

  const refreshQueueCount = useCallback(async () => {
    try {
      setQueueCount(await getSyncQueueCount())
    } catch {
      setQueueCount(0)
    }
  }, [])

  const refreshManifestMeta = useCallback(async (id: string) => {
    if (!id) {
      setManifestMeta(null)
      return
    }
    try {
      setManifestMeta(await getManifestMeta(id))
    } catch {
      setManifestMeta(null)
    }
  }, [])

  const syncQueueToServer = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return

    setIsSyncing(true)
    try {
      const queue = await getSyncQueue()
      if (queue.length === 0) {
        await refreshQueueCount()
        return
      }

      const result = await syncOfflineScansBatch(
        queue.map((item) => ({
          ticketId: item.ticket_id,
          scannedAtLocal: item.scanned_at_local,
          admissionsCount: item.admissions_count,
        })),
      )

      if (!result.success) {
        throw new Error(result.error)
      }

      await clearSyncQueueItems(result.data.syncedIds)
      await refreshQueueCount()
    } catch (error) {
      logger.error({
        context: "door-scanner",
        message: "sync_failed",
        error,
      })
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, refreshQueueCount])

  const handleDownloadManifest = useCallback(async () => {
    if (!eventId || !navigator.onLine) return
    setIsDownloading(true)
    try {
      const meta = await downloadEventManifest(eventId, fetchEventTicketManifest)
      setManifestMeta(meta)
      await refreshQueueCount()
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "No se pudo descargar el manifiesto",
      )
    } finally {
      setIsDownloading(false)
    }
  }, [eventId, refreshQueueCount])

  useEffect(() => {
    let cancelled = false

    void getScannerEvents()
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        if (data[0]) setEventId(data[0].id)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los eventos",
        )
      })

    return () => {
      cancelled = true
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshManifestMeta(eventId)
      void refreshQueueCount()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [eventId, refreshManifestMeta, refreshQueueCount])

  useEffect(() => {
    function onOnline() {
      void syncQueueToServer()
    }
    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [syncQueueToServer])

  useEffect(() => {
    if (!(online && queueCount > 0)) return
    const timer = window.setTimeout(() => {
      void syncQueueToServer()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [online, queueCount, syncQueueToServer])

  const returnToIdle = useCallback((delayMs: number) => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
    }
    resetTimerRef.current = window.setTimeout(() => {
      setVisual("idle")
      setFeedback(null)
      cooldownRef.current = false
      void sendSignal("LED_OFF")
    }, delayMs)
  }, [sendSignal])

  const showLocalSuccess = useCallback(
    (ticket: ScannerManifestTicket) => {
      playTone("success")
      vibrate("success")
      void sendSignal("LED_GREEN")
      setVisual("success")
      const seating = ticket.seating_label
        ? `${ticket.seating_label}${ticket.seating_row_label ? ` · ${ticket.seating_row_label}` : ""} · ingreso ${ticket.admissions_used}/${ticket.max_admissions}`
        : null
      setFeedback({
        title: isTotemModeRef.current
          ? `BIENVENIDO/A ${ticket.owner_name}`
          : "ENTRADA VÁLIDA",
        subtitle: seating
          ? seating
          : isTotemModeRef.current
            ? `Ingreso ${ticket.admissions_used}/${ticket.max_admissions}`
            : `Bienvenid@ ${ticket.owner_name}`,
        bonus: null,
        isFreePass: /freepass|cortes/i.test(ticket.ticket_tier),
      })
      returnToIdle(isTotemModeRef.current ? 1500 : 1800)
    },
    [returnToIdle, sendSignal],
  )

  const showAlreadyUsed = useCallback(
    (when: string | number | null) => {
      playTone("error")
      vibrate("error")
      void sendSignal("LED_RED")
      setVisual("error")
      setFeedback({
        title: isTotemModeRef.current
          ? "ENTRADA YA UTILIZADA"
          : "ALERTA: ENTRADA YA USADA",
        subtitle: `a las ${formatScanTime(when)}`,
      })
      returnToIdle(isTotemModeRef.current ? 2500 : 3200)
    },
    [returnToIdle, sendSignal],
  )

  const showNotFound = useCallback(() => {
    playTone("warn")
    vibrate("warn")
    void sendSignal("LED_RED")
    setVisual("warn")
    setFeedback({
      title: isTotemModeRef.current
        ? "CODIGO INVALIDO"
        : "ENTRADA NO ENCONTRADA",
      subtitle: isTotemModeRef.current
        ? "No se reconoce este ticket"
        : "No está en el manifiesto local de este evento",
    })
    returnToIdle(isTotemModeRef.current ? 2500 : 2500)
  }, [returnToIdle, sendSignal])

  const applyServerResult = useCallback(
    (result: ScanTicketResult) => {
      if (result.success) {
        playTone("success")
        vibrate("success")
        void sendSignal("LED_GREEN")
        setVisual("success")
        const owner = result.ticket.ownerLabel?.trim()
        setFeedback({
          title:
            isTotemModeRef.current && owner
              ? `BIENVENIDO/A ${owner}`
              : "ENTRADA VÁLIDA",
          subtitle: `${result.ticket.seatingLabel ? `${result.ticket.seatingLabel}${result.ticket.seatingRowLabel ? ` · ${result.ticket.seatingRowLabel}` : ""} · ` : ""}${result.ticket.tierName}${
            !isTotemModeRef.current && result.ticket.ownerLabel
              ? ` · ${result.ticket.ownerLabel}`
              : ""
          } · ${result.message}`,
          bonus: result.bonus,
          isFreePass: result.ticket.isFreePass,
        })
        returnToIdle(isTotemModeRef.current ? 1500 : 2000)
        return
      }

      if (result.status === "already_used") {
        showAlreadyUsed(result.scannedAt ?? null)
        return
      }

      if (result.status === "not_found") {
        showNotFound()
        return
      }

      playTone("error")
      vibrate("error")
      void sendSignal("LED_RED")
      setVisual("error")
      setFeedback({
        title:
          result.status === "transferred"
            ? "ENTRADA INVÁLIDA"
            : (ERROR_TITLES[result.status] ?? "ACCESO DENEGADO"),
        subtitle:
          result.status === "transferred"
            ? "Este ticket fue transferido a otro usuario"
            : result.message,
      })
      returnToIdle(
        isTotemModeRef.current
          ? 2500
          : result.status === "transferred"
            ? 4000
            : 3000,
      )
    },
    [returnToIdle, sendSignal, showAlreadyUsed, showNotFound],
  )

  const validateLocalTicket = useCallback(
    async (ticket: ScannerManifestTicket) => {
      if (ticket.status === "used" || ticket.status === "scanned") {
        showAlreadyUsed(ticket.scanned_at_local ?? ticket.scanned_at)
        return
      }

      if (ticket.status === "transferred" || ticket.status === "cancelled") {
        playTone("error")
        vibrate("error")
        void sendSignal("LED_RED")
        setVisual("error")
        setFeedback({
          title: "ENTRADA INVÁLIDA",
          subtitle: `Estado: ${ticket.status}`,
        })
        returnToIdle(isTotemModeRef.current ? 2500 : 2800)
        return
      }

      if (ticket.status === "pending_payment") {
        playTone("error")
        vibrate("error")
        void sendSignal("LED_RED")
        setVisual("error")
        setFeedback({
          title: "PAGO PENDIENTE",
          subtitle: "Esta entrada aún no está habilitada",
        })
        returnToIdle(isTotemModeRef.current ? 2500 : 2800)
        return
      }

      if (ticket.status !== "valid") {
        showAlreadyUsed(ticket.scanned_at_local ?? ticket.scanned_at)
        return
      }

      const updated = await markTicketUsedLocally(ticket.id)
      void refreshQueueCount()
      if (updated) {
        showLocalSuccess(updated)
        if (navigator.onLine) {
          void syncQueueToServer()
        }
      }
    },
    [
      refreshQueueCount,
      returnToIdle,
      sendSignal,
      showAlreadyUsed,
      showLocalSuccess,
      syncQueueToServer,
    ],
  )

  const validateTicketToken = useCallback(
    (rawCode: string) => {
      if (!eventId || cooldownRef.current || visual !== "idle") {
        return
      }

      const raw = rawCode.trim()
      if (!raw) return

      cooldownRef.current = true
      const qrType = selectedEvent?.qrType ?? "dynamic"

      void (async () => {
        try {
          const meta = manifestMeta ?? (await getManifestMeta(eventId))
          if (meta) {
            const resolved = resolveScanSecret(raw, qrType)
            if (!resolved) {
              playTone("error")
              vibrate("error")
              void sendSignal("LED_RED")
              setVisual("error")
              setFeedback({
                title: "QR INVÁLIDO",
                subtitle: "No se pudo leer el código",
              })
              returnToIdle(isTotemModeRef.current ? 2500 : 2200)
              return
            }

            if (resolved.expired) {
              playTone("error")
              vibrate("error")
              void sendSignal("LED_RED")
              setVisual("error")
              setFeedback({
                title: "QR EXPIRADO",
                subtitle: "Pedí el Living QR en pantalla (sin captura)",
              })
              returnToIdle(isTotemModeRef.current ? 2500 : 2500)
              return
            }

            let local: ScannerManifestTicket | null = null

            if (resolved.mode === "v2") {
              local = await getTicketById(resolved.ticketId)
              if (local && local.event_id === eventId) {
                const ok = await assertLivingMac(local.totp_secret, resolved)
                if (!ok) {
                  playTone("error")
                  vibrate("error")
                  void sendSignal("LED_RED")
                  setVisual("error")
                  setFeedback({
                    title: "QR INVÁLIDO",
                    subtitle: "Firma criptográfica no válida",
                  })
                  returnToIdle(isTotemModeRef.current ? 2500 : 2200)
                  return
                }
              } else {
                local = null
              }
            } else {
              local = await getTicketBySecret(eventId, resolved.totpSecret)
            }

            if (local) {
              await validateLocalTicket(local)
              return
            }

            // Manifiesto stale: con red, validar en servidor.
            if (navigator.onLine) {
              startTransition(async () => {
                const result = await scanAndValidateTicket(raw, eventId)
                applyServerResult(result)
              })
              return
            }

            showNotFound()
            return
          }

          if (!navigator.onLine) {
            playTone("warn")
            vibrate("warn")
            void sendSignal("LED_RED")
            setVisual("warn")
            setFeedback({
              title: "SIN MANIFIESTO",
              subtitle: "Descargá el evento con internet antes del show",
            })
            returnToIdle(isTotemModeRef.current ? 2500 : 3000)
            return
          }

          startTransition(async () => {
            const result = await scanAndValidateTicket(raw, eventId)
            applyServerResult(result)
          })
        } catch (error) {
          logger.error({
            context: "door-scanner",
            message: "local_validate_failed",
            error,
          })
          cooldownRef.current = false
        }
      })()
    },
    [
      applyServerResult,
      eventId,
      manifestMeta,
      returnToIdle,
      selectedEvent?.qrType,
      sendSignal,
      showNotFound,
      validateLocalTicket,
      visual,
    ],
  )

  const handleScan = useCallback(
    (detectedCodes: IDetectedBarcode[]) => {
      const raw = detectedCodes[0]?.rawValue?.trim()
      if (!raw) return
      validateTicketToken(raw)
    },
    [validateTicketToken],
  )

  function handleManualNext() {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
    }
    setVisual("idle")
    setFeedback(null)
    cooldownRef.current = false
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex flex-col text-white transition-colors duration-200",
        visual === "success" && "bg-emerald-500",
        visual === "error" && "bg-red-700",
        visual === "warn" && "bg-amber-500",
        visual === "idle" && "bg-black",
        isTotemMode && "select-none",
      )}
    >
      {visual === "idle" ? (
        <>
          <header
            className={cn(
              "relative z-20 space-y-3 bg-gradient-to-b from-black/90 to-transparent px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]",
              isTotemMode && "from-black via-black/95 to-transparent",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-300">
                  {isTotemMode ? "Totem / Kiosco" : "Zero-Offline Scanner"}
                </p>
                <h1 className="mt-1 text-2xl font-black tracking-tight">
                  Escáner Tokepass
                </h1>
              </div>
              {!isTotemMode ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-white/20 bg-white/5 text-white hover:bg-white/10"
                  nativeButton={false}
                  render={<a href="/admin" />}
                >
                  Salir
                </Button>
              ) : null}
            </div>

            <div
              className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-1"
              role="group"
              aria-label="Modo de acceso"
            >
              <button
                type="button"
                onClick={() => setAccessModeAndPersist("guard")}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold transition-colors",
                  !isTotemMode
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <Smartphone className="size-4" aria-hidden="true" />
                Modo Guardia
              </button>
              <button
                type="button"
                onClick={() => setAccessModeAndPersist("totem")}
                className={cn(
                  "inline-flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-bold transition-colors",
                  isTotemMode
                    ? "bg-emerald-600 text-white"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <Monitor className="size-4" aria-hidden="true" />
                Modo Tótem
              </button>
            </div>

            <Select
              value={eventId}
              onValueChange={(value) => {
                setEventId(value ?? "")
              }}
            >
              <SelectTrigger className="h-12 w-full border-white/15 bg-white/10 text-left text-base text-white">
                <SelectValue placeholder="Elegí el evento activo" />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title}
                    {event.qrType === "static" ? " · QR fijo" : ""}
                    {event.status === "draft" ? " (draft)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  online
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-200",
                )}
              >
                {online ? (
                  <Wifi className="size-3.5" />
                ) : (
                  <WifiOff className="size-3.5" />
                )}
                {online ? "Online" : "Offline"}
              </span>

              {hasLocalManifest ? (
                <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                  {manifestMeta?.ticketCount ?? 0} tickets en dispositivo
                </span>
              ) : (
                <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-200">
                  Sin manifiesto local
                </span>
              )}

              {queueCount > 0 ? (
                <span className="rounded-full bg-sky-500/20 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
                  {queueCount} pendientes de sync
                </span>
              ) : null}
            </div>

            <div
              className={cn(
                "grid gap-2",
                isTotemMode ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              <Button
                type="button"
                disabled={!eventId || !online || isDownloading}
                onClick={() => void handleDownloadManifest()}
                className="h-12 rounded-2xl bg-violet-600 text-xs font-bold text-white hover:bg-violet-500"
              >
                {isDownloading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Descargar
              </Button>
              <Button
                type="button"
                disabled={!online || isSyncing || queueCount === 0}
                onClick={() => void syncQueueToServer()}
                className="h-12 rounded-2xl bg-sky-600 text-xs font-bold text-white hover:bg-sky-500"
              >
                {isSyncing ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <CloudUpload className="size-4" />
                )}
                Sincronizar
              </Button>
              {!isTotemMode ? (
                <Button
                  type="button"
                  disabled={!eventId || !hasLocalManifest}
                  onClick={() => setSearchOpen(true)}
                  className="h-12 rounded-2xl bg-zinc-800 text-xs font-bold text-white hover:bg-zinc-700"
                >
                  <Search className="size-4" />
                  Buscador
                </Button>
              ) : null}
            </div>
          </header>

          <div className="relative min-h-0 flex-1">
            {loadError ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <p className="text-lg text-red-300">{loadError}</p>
              </div>
            ) : !eventId ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <ScanLine className="mx-auto size-12 text-zinc-500" />
                  <p className="mt-4 text-lg text-zinc-300">
                    Seleccioná un evento para activar{" "}
                    {isTotemMode ? "el lector HID" : "la cámara"}
                  </p>
                </div>
              </div>
            ) : isTotemMode ? (
              <TotemValidatorView
                enabled={visual === "idle"}
                eventTitle={selectedEvent?.title}
                hasManifest={hasLocalManifest}
                onScan={validateTicketToken}
              />
            ) : cameraError ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <CameraOff className="mx-auto size-12 text-amber-400" />
                  <p className="mt-4 text-xl font-bold">Cámara bloqueada</p>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
                    {cameraError}
                  </p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0">
                <Scanner
                  onScan={handleScan}
                  onError={(error) => {
                    setCameraError(
                      error?.message ||
                        "El navegador no pudo iniciar la cámara",
                    )
                  }}
                  constraints={{ facingMode: "environment" }}
                  formats={["qr_code"]}
                  sound={false}
                  scanDelay={700}
                  allowMultiple={false}
                  paused={isPending || visual !== "idle"}
                  styles={{
                    container: { width: "100%", height: "100%" },
                    video: { objectFit: "cover" },
                  }}
                  components={{
                    finder: true,
                    torch: true,
                  }}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16 text-center">
                  <p className="text-sm font-medium text-zinc-300">
                    {selectedEvent?.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {hasLocalManifest
                      ? "Validación local Instantánea · sync cuando haya red"
                      : "Descargá el manifiesto antes de operar sin señal"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!isTotemMode ? (
            <EmergencyTicketSearch
              eventId={eventId}
              open={searchOpen}
              onOpenChange={setSearchOpen}
              onValidate={(ticket) => {
                setSearchOpen(false)
                cooldownRef.current = true
                void validateLocalTicket(ticket)
              }}
            />
          ) : null}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          {visual === "success" ? (
            <CheckCircle2 className="size-28 drop-shadow-2xl" strokeWidth={2.5} />
          ) : visual === "warn" ? (
            <ShieldAlert className="size-28 drop-shadow-2xl" strokeWidth={2.5} />
          ) : (
            <XCircle className="size-28 drop-shadow-2xl" strokeWidth={2.5} />
          )}

          <p className="mt-8 text-4xl font-black tracking-tight sm:text-6xl">
            {feedback?.title}
          </p>
          {feedback?.subtitle ? (
            <p className="mt-4 max-w-md text-lg font-medium text-white/90 sm:text-2xl">
              {feedback.subtitle}
            </p>
          ) : null}

          {visual === "success" && feedback?.isFreePass ? (
            <div className="mt-8 rounded-2xl bg-black/25 px-6 py-5 ring-2 ring-white/30">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">
                Badge especial
              </p>
              <p className="mt-2 text-3xl font-black tracking-tight">
                CORTESÍA / FREEPASS
              </p>
            </div>
          ) : null}

          {visual === "success" && feedback?.bonus && !feedback.isFreePass ? (
            <div className="mt-8 flex items-center gap-3 rounded-2xl bg-black/20 px-5 py-4 text-left ring-1 ring-white/20">
              <Gift className="size-10 shrink-0" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
                  Smart Yield · Entregar
                </p>
                <p className="text-2xl font-black">{feedback.bonus}</p>
              </div>
            </div>
          ) : null}

          {!isTotemMode ? (
            <Button
              type="button"
              size="lg"
              onClick={handleManualNext}
              className="mt-10 h-14 rounded-full bg-white px-8 text-base font-bold text-black hover:bg-zinc-100"
            >
              Escanear siguiente
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
