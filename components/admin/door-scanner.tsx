"use client"

import type {
  IDetectedBarcode,
  IScannerError,
} from "@yudiel/react-qr-scanner"
import { CameraOff } from "lucide-react"
import dynamic from "next/dynamic"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"

import { DoorScannerSessionChrome } from "@/components/admin/door-scanner-session"
import { DoorScannerSetup } from "@/components/admin/door-scanner-setup"
import { EmergencyTicketSearch } from "@/components/admin/emergency-ticket-search"
import { TotemRestOverlay } from "@/components/admin/totem-validator-view"
import {
  fetchEventTicketManifest,
  getScannerEvents,
  getScannerGates,
  scanAndValidateTicket,
  syncOfflineScansBatch,
  type ScannerEventOption,
  type ScanTicketResult,
} from "@/app/actions/scanner"
import {
  GENERAL_SCANNER_GATE_ID,
  PARKING_SCANNER_GATE_ID,
  resolveTicketSectorKey,
  ticketMatchesScannerGate,
  type ScannerGate,
} from "@/lib/scanner/gate"
import { logger } from "@/lib/logger"
import {
  readScannerAccessMode,
  writeScannerAccessMode,
  type ScannerAccessMode,
} from "@/lib/scanner/access-mode"
import { scannerCameraErrorMessage } from "@/lib/scanner/camera-error"
import {
  denegadoYaIngresoCopy,
  permitidoCopy,
  playGateTone,
  vibrateGate,
} from "@/lib/scanner/scan-copy"
import { useOnlineStatus } from "@/components/pwa/use-online-status"
import { useHardwareSignal } from "@/hooks/use-hardware-signal"
import {
  clearSyncQueueItems,
  countAdmittedTickets,
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

const Scanner = dynamic(() => import("@/components/admin/qr-camera-scanner"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center px-6 text-center">
      <p className="text-sm text-white/70">Activando cámara…</p>
    </div>
  ),
})

type VisualState = "idle" | "success" | "error"

function getLiveVideoTrack(): MediaStreamTrack | null {
  const video = document.querySelector(
    "[data-gate-scanner] video",
  ) as HTMLVideoElement | null
  const stream = video?.srcObject
  if (!(stream instanceof MediaStream)) return null
  return stream.getVideoTracks()[0] ?? null
}

const ERROR_TITLES: Record<string, string> = {
  expired_qr: "DENEGADO - QR expirado",
  already_used: "DENEGADO - Ya ingresó",
  revoked: "DENEGADO - Revocado",
  transferred: "DENEGADO - Transferida",
  cancelled: "DENEGADO - Cancelada",
  wrong_event: "DENEGADO - Evento incorrecto",
  wrong_day: "DENEGADO - Jornada incorrecta",
  not_found: "DENEGADO - No encontrado",
  invalid_payload: "DENEGADO - QR inválido",
  forbidden: "DENEGADO - Sin permiso",
  auth_required: "DENEGADO - Sin sesión",
  update_failed: "DENEGADO - Error",
  unpaid: "DENEGADO - Sin pago",
  test_ticket_live: "DENEGADO - Entrada de prueba",
  wrong_sector: "DENEGADO - Sector incorrecto",
}

function ticketSectorLabel(ticket: ScannerManifestTicket): string {
  return (
    ticket.seating_sector_name?.trim() ||
    ticket.seating_label?.trim() ||
    ticket.ticket_tier
  )
}

export function DoorScanner() {
  const online = useOnlineStatus()
  const { sendSignal } = useHardwareSignal()
  const [accessMode, setAccessMode] = useState<ScannerAccessMode>("guard")
  const isTotemMode = accessMode === "totem"
  const [sessionActive, setSessionActive] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [events, setEvents] = useState<ScannerEventOption[]>([])
  const [eventId, setEventId] = useState<string>("")
  const [gateId, setGateId] = useState<string>("")
  const [gates, setGates] = useState<ScannerGate[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "environment",
  )
  const [visual, setVisual] = useState<VisualState>("idle")
  const [feedbackTitle, setFeedbackTitle] = useState<string>("")
  const [isPending, startTransition] = useTransition()
  const [manifestMeta, setManifestMeta] = useState<ScannerManifestMeta | null>(
    null,
  )
  const [queueCount, setQueueCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [admittedCount, setAdmittedCount] = useState(0)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const cooldownRef = useRef(false)
  const resetTimerRef = useRef<number | null>(null)
  const isTotemModeRef = useRef(isTotemMode)
  isTotemModeRef.current = isTotemMode

  useEffect(() => {
    setAccessMode(readScannerAccessMode())
  }, [])

  const setAccessModeAndPersist = useCallback((mode: ScannerAccessMode) => {
    setAccessMode(mode)
    writeScannerAccessMode(mode)
    setCameraError(null)
    setFacingMode(mode === "totem" ? "user" : "environment")
  }, [])

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === eventId) ?? null,
    [events, eventId],
  )
  const selectedGate = useMemo(
    () => gates.find((gate) => gate.id === gateId) ?? null,
    [gates, gateId],
  )

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
      if (!result.success) throw new Error(result.error)
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
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
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
    if (!eventId) {
      setGates([])
      setGateId("")
      return
    }
    let cancelled = false
    const stored =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(`tokepass.scanner.gate.${eventId}`)
        : null
    void getScannerGates(eventId)
      .then((data) => {
        if (cancelled) return
        setGates(data)
        const validStored = data.some((gate) => gate.id === stored)
        const next = validStored
          ? stored!
          : data.length === 1
            ? data[0]!.id
            : ""
        setGateId(next)
      })
      .catch(() => {
        if (cancelled) return
        setGates([
          {
            id: GENERAL_SCANNER_GATE_ID,
            label: "Acceso General",
            color: "#10b981",
            kind: "general",
          },
          {
            id: PARKING_SCANNER_GATE_ID,
            label: "Barrera de Estacionamiento",
            color: "#f59e0b",
            kind: "parking",
          },
        ])
        setGateId(GENERAL_SCANNER_GATE_ID)
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  useEffect(() => {
    if (!eventId || !gateId) return
    try {
      window.sessionStorage.setItem(
        `tokepass.scanner.gate.${eventId}`,
        gateId,
      )
    } catch {
      // sessionStorage opcional
    }
  }, [eventId, gateId])

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

  const returnToIdle = useCallback(
    (delayMs: number) => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => {
        setVisual("idle")
        setFeedbackTitle("")
        cooldownRef.current = false
        void sendSignal("LED_OFF")
      }, delayMs)
    },
    [sendSignal],
  )

  const flashGranted = useCallback(
    (title: string) => {
      playGateTone("success")
      vibrateGate("success")
      void sendSignal("LED_GREEN")
      setVisual("success")
      setFeedbackTitle(title)
      returnToIdle(isTotemModeRef.current ? 1500 : 1000)
    },
    [returnToIdle, sendSignal],
  )

  const flashDenied = useCallback(
    (title: string) => {
      playGateTone("error")
      vibrateGate("error")
      void sendSignal("LED_RED")
      setVisual("error")
      setFeedbackTitle(title)
      returnToIdle(2000)
    },
    [returnToIdle, sendSignal],
  )

  const showLocalSuccess = useCallback(
    (ticket: ScannerManifestTicket) => {
      setAdmittedCount((count) => count + 1)
      flashGranted(
        permitidoCopy({
          ownerName: ticket.owner_name,
          sector: ticketSectorLabel(ticket),
        }),
      )
    },
    [flashGranted],
  )

  const showAlreadyUsed = useCallback(
    (when: string | number | null) => {
      flashDenied(denegadoYaIngresoCopy(when))
    },
    [flashDenied],
  )

  const applyServerResult = useCallback(
    (result: ScanTicketResult) => {
      if (result.success) {
        setAdmittedCount((count) => count + 1)
        flashGranted(
          permitidoCopy({
            ownerName: result.ticket.ownerLabel ?? "Titular",
            sector:
              result.ticket.seatingSectorName ??
              result.ticket.seatingLabel ??
              result.ticket.tierName,
          }),
        )
        return
      }
      if (result.status === "already_used") {
        showAlreadyUsed(result.scannedAt ?? null)
        return
      }
      if (result.status === "wrong_sector") {
        flashDenied(
          `DENEGADO - Dirigirse a ${result.redirectSector ?? "otra gatera"}`,
        )
        return
      }
      flashDenied(ERROR_TITLES[result.status] ?? "DENEGADO")
    },
    [flashDenied, flashGranted, showAlreadyUsed],
  )

  const validateLocalTicket = useCallback(
    async (ticket: ScannerManifestTicket) => {
      const eventStatus =
        selectedEvent?.status ?? manifestMeta?.eventStatus ?? null
      if (ticket.is_test && !ticket.is_sandbox && eventStatus !== "draft") {
        flashDenied("DENEGADO - Entrada de prueba")
        return
      }
      if (ticket.status === "used" || ticket.status === "scanned") {
        showAlreadyUsed(ticket.scanned_at_local ?? ticket.scanned_at)
        return
      }
      if (ticket.status === "transferred" || ticket.status === "cancelled") {
        flashDenied("DENEGADO - Entrada inválida")
        return
      }
      if (ticket.status === "pending_payment") {
        flashDenied("DENEGADO - Pago pendiente")
        return
      }

      const ticketGate = resolveTicketSectorKey({
        seatingSectorId: ticket.seating_sector_id,
        seatingSectorName: ticket.seating_sector_name,
      })
      const gateMatch = ticketMatchesScannerGate(
        gateId || GENERAL_SCANNER_GATE_ID,
        { ...ticketGate, ticketType: ticket.ticket_type },
      )
      if (!gateMatch.ok) {
        flashDenied(`DENEGADO - Dirigirse a ${gateMatch.correctSector}`)
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
        if (navigator.onLine) void syncQueueToServer()
      }
    },
    [
      flashDenied,
      gateId,
      manifestMeta?.eventStatus,
      refreshQueueCount,
      selectedEvent?.status,
      showAlreadyUsed,
      showLocalSuccess,
      syncQueueToServer,
    ],
  )

  const validateTicketToken = useCallback(
    (rawCode: string) => {
      if (!eventId || !gateId || cooldownRef.current || visual !== "idle") {
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
              flashDenied("DENEGADO - QR inválido")
              return
            }
            if (resolved.enforceFreshness && resolved.expired) {
              flashDenied("DENEGADO - QR expirado")
              return
            }

            let local: ScannerManifestTicket | null = null
            if (resolved.mode === "v2") {
              local = await getTicketById(resolved.ticketId)
              if (local && local.event_id === eventId) {
                const ok = await assertLivingMac(local.totp_secret, resolved)
                if (!ok) {
                  flashDenied("DENEGADO - QR inválido")
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
            if (navigator.onLine) {
              startTransition(async () => {
                const result = await scanAndValidateTicket(raw, eventId, gateId)
                applyServerResult(result)
              })
              return
            }
            flashDenied("DENEGADO - No encontrado")
            return
          }

          if (!navigator.onLine) {
            flashDenied("DENEGADO - Sin lista local")
            return
          }
          startTransition(async () => {
            const result = await scanAndValidateTicket(raw, eventId, gateId)
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
      flashDenied,
      gateId,
      manifestMeta,
      selectedEvent?.qrType,
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

  async function startControl() {
    if (!eventId || !gateId || isStarting) return
    setIsStarting(true)
    setLoadError(null)
    try {
      if (navigator.onLine) {
        const meta = await downloadEventManifest(
          eventId,
          fetchEventTicketManifest,
        )
        setManifestMeta(meta)
      } else {
        const local = await getManifestMeta(eventId)
        if (!local) {
          setLoadError(
            "Sin conexión y sin lista local. Conectate para bajar las entradas.",
          )
          return
        }
        setManifestMeta(local)
      }
      setAdmittedCount(await countAdmittedTickets(eventId))
      await refreshQueueCount()
      setFacingMode(isTotemMode ? "user" : "environment")
      setCameraError(null)
      setTorchOn(false)
      setSessionActive(true)
    } catch (error) {
      const local = await getManifestMeta(eventId)
      if (local) {
        setManifestMeta(local)
        setAdmittedCount(await countAdmittedTickets(eventId))
        setFacingMode(isTotemMode ? "user" : "environment")
        setSessionActive(true)
        return
      }
      setLoadError(
        error instanceof Error
          ? error.message
          : "No se pudieron bajar las entradas para trabajar sin conexión",
      )
    } finally {
      setIsStarting(false)
    }
  }

  async function toggleTorch() {
    const track = getLiveVideoTrack()
    if (!track?.applyConstraints) return
    const capabilities = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { torch?: boolean })
      | undefined
    if (!capabilities?.torch) {
      setTorchAvailable(false)
      return
    }
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
      setTorchAvailable(true)
    } catch {
      setTorchAvailable(false)
    }
  }

  function handleCameraError(error: IScannerError) {
    if (error.kind === "overconstrained" && facingMode === "user") {
      setFacingMode("environment")
      setCameraError(null)
      return
    }
    setCameraError(scannerCameraErrorMessage(error))
  }

  useEffect(() => {
    if (!sessionActive || isTotemMode) {
      setTorchAvailable(false)
      return
    }
    const timer = window.setInterval(() => {
      const track = getLiveVideoTrack()
      const capabilities = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined
      setTorchAvailable(Boolean(capabilities?.torch))
    }, 800)
    return () => window.clearInterval(timer)
  }, [sessionActive, isTotemMode])

  if (!sessionActive) {
    return (
      <DoorScannerSetup
        events={events}
        eventId={eventId}
        gates={gates}
        gateId={gateId}
        accessMode={accessMode}
        loadError={loadError}
        isStarting={isStarting}
        onEventChange={setEventId}
        onGateChange={setGateId}
        onModeChange={setAccessModeAndPersist}
        onStart={() => void startControl()}
      />
    )
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex flex-col text-white transition-colors duration-75",
        visual === "success" && "bg-emerald-500",
        visual === "error" && "bg-rose-600",
        visual === "idle" && "bg-black",
        isTotemMode && "select-none",
      )}
    >
      {visual === "idle" ? (
        <>
          <DoorScannerSessionChrome
            isTotem={isTotemMode}
            gateLabel={selectedGate?.label ?? "Gatera"}
            online={online}
            admittedCount={admittedCount}
            torchOn={torchOn}
            torchAvailable={torchAvailable}
            onChangeGate={() => {
              setSessionActive(false)
              setCameraError(null)
              setTorchOn(false)
            }}
            onSearch={() => setSearchOpen(true)}
            onToggleTorch={() => void toggleTorch()}
            overlay={
              isTotemMode ? (
                <TotemRestOverlay
                  enabled
                  onScan={validateTicketToken}
                />
              ) : null
            }
            camera={
              cameraError ? (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div>
                    <CameraOff className="mx-auto size-12 text-amber-400" />
                    <p className="mt-4 text-xl font-bold">Cámara bloqueada</p>
                    <p className="mt-2 max-w-sm text-sm leading-6 text-white/70">
                      {cameraError}
                    </p>
                    <button
                      type="button"
                      className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-fuchsia-300"
                      onClick={() => setCameraError(null)}
                    >
                      Reintentar
                    </button>
                  </div>
                </div>
              ) : (
                <Scanner
                  onScan={handleScan}
                  onError={handleCameraError}
                  constraints={{ facingMode }}
                  formats={["qr_code"]}
                  sound={false}
                  scanDelay={250}
                  allowMultiple={false}
                  paused={isPending || visual !== "idle"}
                  styles={{
                    container: { width: "100%", height: "100%" },
                    video: { objectFit: "cover" },
                  }}
                  components={{ finder: false, torch: false }}
                />
              )
            }
          />
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
              onValidateMany={(tickets) => {
                setSearchOpen(false)
                cooldownRef.current = true
                void (async () => {
                  for (const ticket of tickets) {
                    await validateLocalTicket(ticket)
                  }
                })()
              }}
            />
          ) : null}
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl">
            {feedbackTitle}
          </p>
        </div>
      )}
    </div>
  )
}
