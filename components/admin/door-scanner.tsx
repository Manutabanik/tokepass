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
  useSyncExternalStore,
} from "react"

import { DoorScannerSessionChrome } from "@/components/admin/door-scanner-session"
import { DoorScannerSetup } from "@/components/admin/door-scanner-setup"
import { EmergencyTicketSearch } from "@/components/admin/emergency-ticket-search"
import { AppTakeover } from "@/components/ui/app-takeover"
import { TotemRestOverlay } from "@/components/admin/totem-validator-view"
import {
  fetchEventAdmissionSnapshot,
  fetchEventTicketManifest,
  getScannerEvents,
  getScannerGates,
  getScannerOperatorLabel,
  scanAndValidateTicket,
  syncOfflineScansBatch,
  type ScannerEventOption,
  type ScanTicketResult,
} from "@/app/actions/scanner"
import { overlayKindFromDeniedScanStatus } from "@/lib/scanner/offline-sync-conflicts"
import {
  ScanResultOverlay,
  type ScanOverlayState,
} from "@/components/admin/scan-result-overlay"
import {
  ALL_SCANNER_GATE_ID,
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
  playGateTone,
  vibrateGate,
} from "@/lib/scanner/scan-copy"
import { useOnlineStatus } from "@/components/pwa/use-online-status"
import { useHardwareSignal } from "@/hooks/use-hardware-signal"
import { useScreenWakeLock } from "@/hooks/use-wake-lock"
import { requestDoorAssetCache } from "@/lib/pwa/door-cache"
import { prefetchDoorManifest } from "@/lib/scanner/prefetch-manifest"
import {
  applyAdmissionSnapshot,
  clearSyncQueueItems,
  countAdmittedTickets,
  countAdmissionLeases,
  downloadEventManifest,
  getManifestMeta,
  getScannerVault,
  getSyncQueue,
  getSyncQueueCount,
  getTicketById,
  getTicketBySecret,
  markTicketUsedLocally,
  putAdmissionLease,
  saveScannerVault,
  type ScannerManifestMeta,
  type ScannerManifestTicket,
} from "@/lib/offline-scanner-store"
import {
  buildAdmissionLeaseHash,
  decideOfflineAdmission,
  readScannerDeviceId,
  readScannerDeviceSlot,
  writeScannerDeviceSlot,
} from "@/lib/scanner/admission-lease"
import { selectOfflineScansReadyToFlush } from "@/lib/scanner/flush-offline-queue"
import { evaluateOfflineManifestGate } from "@/lib/scanner/offline-manifest-gate"
import {
  hasLiveLeasePeers,
  publishAdmissionLease,
  startLeaseGossip,
  stopLeaseGossip,
} from "@/lib/scanner/lease-gossip"
import {
  isScannerVaultUnlocked,
  ScannerVaultError,
  unlockOrCreateScannerVault,
} from "@/lib/scanner/manifest-crypto"
import {
  assertLivingMac,
  assertStaticMac,
  isRetiredTransferSecret,
  resolveScanSecret,
} from "@/lib/scan-payload"
import { hashTotpSecretSha256 } from "@/lib/scanner/totp-secret-hash"
import { serverAlignedNowMs } from "@/lib/totp-offline"
import { cn } from "@/lib/utils"

const Scanner = dynamic(() => import("@/components/admin/qr-camera-scanner"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center px-6 text-center">
      <p className="text-sm text-white/70">Activando cámara…</p>
    </div>
  ),
})

const OVERLAY_MS = 2500

const FALLBACK_GATES: ScannerGate[] = [
  {
    id: ALL_SCANNER_GATE_ID,
    label: "Todas las puertas",
    color: "#a1a1aa",
    kind: "general",
  },
  {
    id: GENERAL_SCANNER_GATE_ID,
    label: "Puerta Principal",
    color: "#10b981",
    kind: "general",
  },
  {
    id: PARKING_SCANNER_GATE_ID,
    label: "Barrera de Estacionamiento",
    color: "#f59e0b",
    kind: "parking",
  },
]

function subscribeScannerAccessMode(onChange: () => void) {
  window.addEventListener("tokepass-scanner-access-mode", onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener("tokepass-scanner-access-mode", onChange)
    window.removeEventListener("storage", onChange)
  }
}

function subscribeScannerDeviceSlot(onChange: () => void) {
  window.addEventListener("tokepass-scanner-device-slot", onChange)
  return () => {
    window.removeEventListener("tokepass-scanner-device-slot", onChange)
  }
}

function getLiveVideoTrack(): MediaStreamTrack | null {
  const video = document.querySelector(
    "[data-gate-scanner] video",
  ) as HTMLVideoElement | null
  const stream = video?.srcObject
  if (!(stream instanceof MediaStream)) return null
  return stream.getVideoTracks()[0] ?? null
}

export function DoorScanner({
  guestEvent,
}: {
  guestEvent?: ScannerEventOption
} = {}) {
  const online = useOnlineStatus()
  const { sendSignal } = useHardwareSignal()
  const accessMode = useSyncExternalStore(
    subscribeScannerAccessMode,
    readScannerAccessMode,
    () => "guard" as const,
  )
  const isTotemMode = accessMode === "totem"
  const [sessionActive, setSessionActive] = useState(false)
  const wakeLockHeld = useScreenWakeLock(sessionActive)
  const [isStarting, setIsStarting] = useState(false)
  const [events, setEvents] = useState<ScannerEventOption[]>(
    guestEvent ? [guestEvent] : [],
  )
  const [eventId, setEventId] = useState<string>(guestEvent?.id ?? "")
  const [gateId, setGateId] = useState<string>("")
  const [gates, setGates] = useState<ScannerGate[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    "environment",
  )
  const [overlay, setOverlay] = useState<ScanOverlayState | null>(null)
  const [operatorName, setOperatorName] = useState(
    guestEvent ? "Staff de puerta" : "Operador",
  )
  const [isPending, startTransition] = useTransition()
  const [manifestMeta, setManifestMeta] = useState<ScannerManifestMeta | null>(
    null,
  )
  const [queueCount, setQueueCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [admittedCount, setAdmittedCount] = useState(0)
  const [torchOn, setTorchOn] = useState(false)
  const [detectedTorch, setDetectedTorch] = useState(false)
  const [sessionPin, setSessionPin] = useState("")
  const [vaultExists, setVaultExists] = useState(false)
  const [gatesEventId, setGatesEventId] = useState("")
  const cooldownRef = useRef(false)
  const resetTimerRef = useRef<number | null>(null)
  const isTotemModeRef = useRef(isTotemMode)

  const deviceSlotJson = useSyncExternalStore(
    subscribeScannerDeviceSlot,
    () => JSON.stringify(readScannerDeviceSlot(eventId, gateId)),
    () => JSON.stringify({ index: 0, count: 1 }),
  )
  const deviceSlot = JSON.parse(deviceSlotJson) as {
    index: number
    count: number
  }
  const deviceSlotIndex = deviceSlot.index
  const deviceSlotCount = deviceSlot.count
  const torchAvailable = sessionActive && !isTotemMode && detectedTorch

  useEffect(() => {
    isTotemModeRef.current = isTotemMode
  }, [isTotemMode])

  useEffect(() => {
    void getScannerVault()
      .then((vault) => setVaultExists(Boolean(vault)))
      .catch(() => setVaultExists(false))
    return () => {
      stopLeaseGossip()
    }
  }, [])

  const setAccessModeAndPersist = useCallback((mode: ScannerAccessMode) => {
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

      const eventIds = [
        ...new Set(queue.map((item) => item.event_id).filter(Boolean)),
      ]
      for (const id of eventIds) {
        const meta = await downloadEventManifest(id, fetchEventTicketManifest)
        if (id === eventId) setManifestMeta(meta)
      }

      const tickets = await Promise.all(
        queue.map((item) => getTicketById(item.ticket_id)),
      )
      const ready = selectOfflineScansReadyToFlush(queue, tickets)
      if (ready.length === 0) {
        await refreshQueueCount()
        return
      }

      const result = await syncOfflineScansBatch(
        ready.map((item) => ({
          ticketId: item.ticket_id,
          scannedAtLocal: item.scanned_at_local,
          admissionsCount: item.admissions_count,
        })),
      )
      if (!result.success) throw new Error(result.error)
      await clearSyncQueueItems([
        ...result.data.syncedIds,
        ...(result.data.evictedIds ?? []),
      ])
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
  }, [eventId, isSyncing, refreshQueueCount])

  useEffect(() => {
    let cancelled = false
    if (guestEvent) {
      return () => {
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      }
    }
    void getScannerEvents()
      .then((data) => {
        if (cancelled) return
        setEvents(data)
        if (data[0]) setEventId(data[0].id)
        void getScannerOperatorLabel().then((name) => {
          if (!cancelled) setOperatorName(name)
        })
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
  }, [guestEvent])

  useEffect(() => {
    requestDoorAssetCache()
    if (!eventId || sessionActive) return
    if (typeof navigator !== "undefined" && !navigator.onLine) return
    void prefetchDoorManifest(eventId, fetchEventTicketManifest).catch(() => {})
  }, [eventId, sessionActive])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshManifestMeta(eventId)
      void refreshQueueCount()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [eventId, refreshManifestMeta, refreshQueueCount])

  if (eventId !== gatesEventId) {
    setGatesEventId(eventId)
    setGates([])
    setGateId("")
  }

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    const stored =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(`tokepass.scanner.gate.${eventId}`)
        : null
    void getScannerGates(eventId)
      .then((data) => {
        if (cancelled) return
        const nextGates = data.length > 0 ? data : FALLBACK_GATES
        setGates(nextGates)
        const validStored = nextGates.some((gate) => gate.id === stored)
        setGateId(
          validStored
            ? stored!
            : (nextGates.find((gate) => gate.id === ALL_SCANNER_GATE_ID)?.id ??
                nextGates[0]!.id),
        )
      })
      .catch(() => {
        if (cancelled) return
        setGates(FALLBACK_GATES)
        setGateId(ALL_SCANNER_GATE_ID)
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
        setOverlay(null)
        cooldownRef.current = false
        void sendSignal("LED_OFF")
      }, delayMs)
    },
    [sendSignal],
  )

  const showOverlay = useCallback(
    (next: ScanOverlayState) => {
      const tone =
        next.kind === "valid"
          ? "success"
          : next.kind === "wrong_sector" ||
              next.kind === "main_gate_review" ||
              next.kind === "transfer_pending" ||
              next.kind === "listed_for_resale" ||
              next.kind === "wrong_schedule" ||
              next.kind === "unpaid" ||
              next.kind === "transferred"
            ? "warning"
            : "error"
      playGateTone(tone)
      vibrateGate(tone)
      void sendSignal(
        next.kind === "valid"
          ? "LED_GREEN"
          : next.kind === "wrong_sector" ||
              next.kind === "main_gate_review" ||
              next.kind === "transfer_pending" ||
              next.kind === "listed_for_resale" ||
              next.kind === "wrong_schedule" ||
              next.kind === "unpaid" ||
              next.kind === "transferred"
            ? "LED_OFF"
            : "LED_RED",
      )
      setOverlay(next)
      returnToIdle(isTotemModeRef.current ? 1500 : OVERLAY_MS)
    },
    [returnToIdle, sendSignal],
  )

  const showLocalSuccess = useCallback(
    (ticket: ScannerManifestTicket) => {
      setAdmittedCount((count) => count + 1)
      showOverlay({
        kind: "valid",
        holderName: ticket.owner_name || "Titular",
        passType: ticket.ticket_tier || "GENERAL",
        sector: ticket.seating_sector_name,
        place: ticket.seating_label,
      })
    },
    [showOverlay],
  )

  const showAlreadyUsed = useCallback(
    (when: string | number | null, gateName?: string | null, operator?: string | null) => {
      showOverlay({
        kind: "duplicate",
        scannedAt: when,
        gateName: gateName ?? selectedGate?.label ?? "Puerta Principal",
        operatorName: operator ?? operatorName,
      })
    },
    [operatorName, selectedGate?.label, showOverlay],
  )

  const applyServerResult = useCallback(
    (result: ScanTicketResult) => {
      if (result.success) {
        setAdmittedCount((count) => count + 1)
        showOverlay({
          kind: "valid",
          holderName: result.ticket.ownerLabel ?? "Titular",
          passType: result.ticket.tierName || "GENERAL",
          sector: result.ticket.seatingSectorName,
          place: result.ticket.seatingLabel,
        })
        return
      }
      if (result.status === "already_used") {
        showAlreadyUsed(
          result.scannedAt ?? null,
          result.gateName,
          result.operatorName,
        )
        return
      }
      const kind = overlayKindFromDeniedScanStatus(result.status)
      if (kind === "duplicate") {
        showAlreadyUsed(
          result.scannedAt ?? null,
          result.gateName,
          result.operatorName,
        )
        return
      }
      if (kind === "wrong_sector") {
        showOverlay({
          kind: "wrong_sector",
          correctGateName: result.redirectSector ?? "otra gatera",
        })
        return
      }
      if (kind === "wrong_schedule") {
        showOverlay({
          kind: "wrong_schedule",
          message: result.message,
        })
        return
      }
      if (
        kind === "cancelled" ||
        kind === "unpaid" ||
        kind === "transferred" ||
        kind === "expired_qr" ||
        kind === "test_ticket" ||
        kind === "transfer_pending" ||
        kind === "listed_for_resale" ||
        kind === "invalid"
      ) {
        showOverlay({ kind })
        return
      }
      showOverlay({ kind: "invalid" })
    },
    [showAlreadyUsed, showOverlay],
  )

  const validateLocalTicket = useCallback(
    async (ticket: ScannerManifestTicket) => {
      if (ticket.is_test) {
        showOverlay({ kind: "test_ticket" })
        return
      }
      if (ticket.status === "used" || ticket.status === "scanned") {
        showAlreadyUsed(ticket.scanned_at_local ?? ticket.scanned_at)
        return
      }
      if (ticket.status === "transferred") {
        showOverlay({ kind: "transferred" })
        return
      }
      if (ticket.status === "cancelled" || ticket.status === "revoked") {
        showOverlay({ kind: "cancelled" })
        return
      }
      if (ticket.status === "pending_payment") {
        showOverlay({ kind: "unpaid" })
        return
      }

      const manifestGate = evaluateOfflineManifestGate({
        pendingTransfer: ticket.pending_transfer,
        listedForResale: ticket.listed_for_resale,
        dayId: ticket.day_id,
        scheduleDays: manifestMeta?.scheduleDays,
        eventDate: manifestMeta?.eventDate,
        now: new Date(serverAlignedNowMs(manifestMeta?.clockOffsetMs)),
      })
      if (!manifestGate.ok) {
        if (manifestGate.reason === "transfer_pending") {
          showOverlay({ kind: "transfer_pending" })
          return
        }
        if (manifestGate.reason === "listed_for_resale") {
          showOverlay({ kind: "listed_for_resale" })
          return
        }
        showOverlay({
          kind: "wrong_schedule",
          message: manifestGate.message,
        })
        return
      }

      const ticketGate = resolveTicketSectorKey({
        seatingSectorId: ticket.seating_sector_id,
        seatingSectorName: ticket.seating_sector_name,
      })
      const gateMatch = ticketMatchesScannerGate(
        gateId || ALL_SCANNER_GATE_ID,
        { ...ticketGate, ticketType: ticket.ticket_type },
      )
      if (!gateMatch.ok) {
        showOverlay({
          kind: "wrong_sector",
          correctGateName: gateMatch.correctSector,
        })
        return
      }
      if (ticket.status !== "valid") {
        showAlreadyUsed(ticket.scanned_at_local ?? ticket.scanned_at)
        return
      }

      const leaseCount = await countAdmissionLeases(ticket.id)
      const decision = decideOfflineAdmission({
        status: ticket.status,
        admissionsUsed: ticket.admissions_used ?? 0,
        maxAdmissions: ticket.max_admissions ?? 1,
        groupId: ticket.group_id,
        ticketId: ticket.id,
        deviceSlotIndex,
        deviceSlotCount,
        online: navigator.onLine,
        hasLivePeers: hasLiveLeasePeers(),
        localLeaseCount: leaseCount,
        scannedAt: ticket.scanned_at_local ?? null,
      })
      if (decision.action === "duplicate") {
        showAlreadyUsed(decision.scannedAt ?? ticket.scanned_at_local ?? ticket.scanned_at)
        return
      }
      if (decision.action === "reject") {
        showOverlay({ kind: "invalid" })
        return
      }
      if (decision.action === "main_gate_review") {
        showOverlay({
          kind: "main_gate_review",
          reason: decision.reason === "range_mismatch" ? "range_mismatch" : "group_no_peers",
        })
        return
      }

      const scannedAtLocal = Date.now()
      const deviceId = readScannerDeviceId()
      const admissionCounter = (ticket.admissions_used ?? 0) + 1
      const leaseHash = await buildAdmissionLeaseHash({
        deviceId,
        ticketId: ticket.id,
        timestamp: scannedAtLocal,
        admissionCounter,
      })
      const updated = await markTicketUsedLocally(ticket.id, scannedAtLocal, {
        device_id: deviceId,
        lease_hash: leaseHash,
      })
      void refreshQueueCount()
      if (updated) {
        publishAdmissionLease({
          id: `${ticket.id}:${admissionCounter}`,
          ticket_id: ticket.id,
          event_id: ticket.event_id,
          device_id: deviceId,
          admission_counter: admissionCounter,
          timestamp: scannedAtLocal,
          lease_hash: leaseHash,
          source: "local",
        })
        showLocalSuccess(updated)
        if (navigator.onLine) void syncQueueToServer()
      }
    },
    [
      gateId,
      deviceSlotCount,
      deviceSlotIndex,
      manifestMeta,
      refreshQueueCount,
      showAlreadyUsed,
      showLocalSuccess,
      showOverlay,
      syncQueueToServer,
    ],
  )

  const validateTicketToken = useCallback(
    (rawCode: string) => {
      if (!eventId || !gateId || cooldownRef.current || overlay) {
        return
      }
      const raw = rawCode.trim()
      if (!raw) return
      cooldownRef.current = true
      const qrType = selectedEvent?.qrType ?? "dynamic"

      void (async () => {
        try {
          if (typeof navigator !== "undefined" && navigator.onLine) {
            startTransition(async () => {
              const result = await scanAndValidateTicket(raw, eventId, gateId)
              applyServerResult(result)
            })
            return
          }

          const meta = manifestMeta ?? (await getManifestMeta(eventId))
          if (!meta) {
            showOverlay({ kind: "invalid" })
            return
          }

          const resolved = resolveScanSecret(raw, qrType, {
            nowMs: serverAlignedNowMs(meta.clockOffsetMs),
          })
          if (!resolved) {
            showOverlay({ kind: "invalid" })
            return
          }
          if (resolved.enforceFreshness && resolved.expired) {
            showOverlay({ kind: "expired_qr" })
            return
          }

          let local: ScannerManifestTicket | null = null
          if (resolved.mode === "v2" || resolved.mode === "tps") {
            local = await getTicketById(resolved.ticketId)
            if (local && local.event_id === eventId) {
              const ok =
                resolved.mode === "v2"
                  ? await assertLivingMac(local.totp_secret, resolved)
                  : await assertStaticMac(local.totp_secret, resolved)
              if (!ok) {
                showOverlay({ kind: "invalid" })
                return
              }
            } else {
              local = null
            }
          } else {
            local = await getTicketBySecret(eventId, resolved.totpSecret)
          }

          if (!local) {
            showOverlay({ kind: "invalid" })
            return
          }
          if (isRetiredTransferSecret(local.totp_secret)) {
            showOverlay({ kind: "transferred" })
            return
          }

          const snapshotHash = local.totp_secret_hash?.trim() ?? ""
          if (snapshotHash) {
            const scannedHash = await hashTotpSecretSha256(local.totp_secret)
            if (!scannedHash || scannedHash !== snapshotHash) {
              showOverlay({ kind: "invalid" })
              return
            }
          }

          await validateLocalTicket(local)
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
      showOverlay,
      gateId,
      manifestMeta,
      overlay,
      selectedEvent?.qrType,
      validateLocalTicket,
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
      const existingVault = await getScannerVault()
      const unlocked = await unlockOrCreateScannerVault(sessionPin, existingVault)
      if (unlocked.created) {
        await saveScannerVault(unlocked.record)
      }
      setVaultExists(true)

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
      startLeaseGossip({
        eventId,
        deviceId: readScannerDeviceId(),
        onRemoteLease: (lease) => {
          void putAdmissionLease({ ...lease, source: "peer" })
        },
      })
      setFacingMode(isTotemMode ? "user" : "environment")
      setCameraError(null)
      setTorchOn(false)
      setSessionActive(true)
    } catch (error) {
      if (error instanceof ScannerVaultError) {
        setLoadError(error.message)
        return
      }
      const local = await getManifestMeta(eventId)
      if (local && isScannerVaultUnlocked()) {
        setManifestMeta(local)
        setAdmittedCount(await countAdmittedTickets(eventId))
        startLeaseGossip({
          eventId,
          deviceId: readScannerDeviceId(),
          onRemoteLease: (lease) => {
            void putAdmissionLease({ ...lease, source: "peer" })
          },
        })
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
      setDetectedTorch(false)
      return
    }
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
      setDetectedTorch(true)
    } catch {
      setDetectedTorch(false)
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
    if (!sessionActive || !eventId) return
    let cancelled = false

    async function pullAdmissions() {
      if (!navigator.onLine) return
      try {
        const snap = await fetchEventAdmissionSnapshot(eventId)
        if (cancelled) return
        await applyAdmissionSnapshot(eventId, snap.tickets)
        setAdmittedCount(await countAdmittedTickets(eventId))
      } catch (error) {
        logger.error({
          context: "door-scanner",
          message: "admission_snapshot_failed",
          error,
        })
      }
    }

    void pullAdmissions()
    // Online snapshot: 20s. Offline ops SLO: OFFLINE_ADMISSION_SYNC_MINUTES.
    const timer = window.setInterval(() => {
      void pullAdmissions()
    }, 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [sessionActive, eventId])

  useEffect(() => {
    if (!sessionActive || isTotemMode) return
    const timer = window.setInterval(() => {
      const track = getLiveVideoTrack()
      const capabilities = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined
      setDetectedTorch(Boolean(capabilities?.torch))
    }, 800)
    return () => window.clearInterval(timer)
  }, [sessionActive, isTotemMode])

  if (!sessionActive) {
    return (
      <DoorScannerSetup
        guestMode={Boolean(guestEvent)}
        events={events}
        eventId={eventId}
        gates={gates}
        gateId={gateId}
        accessMode={accessMode}
        loadError={loadError}
        isStarting={isStarting}
        sessionPin={sessionPin}
        vaultExists={vaultExists}
        deviceSlotCount={deviceSlotCount}
        deviceSlotIndex={deviceSlotIndex}
        onEventChange={setEventId}
        onGateChange={setGateId}
        onModeChange={setAccessModeAndPersist}
        onSessionPinChange={setSessionPin}
        onDeviceSlotCountChange={(count) => {
          const nextIndex = Math.min(count - 1, deviceSlotIndex)
          writeScannerDeviceSlot(eventId, gateId, {
            index: nextIndex,
            count,
          })
        }}
        onDeviceSlotIndexChange={(index) => {
          writeScannerDeviceSlot(eventId, gateId, {
            index,
            count: deviceSlotCount,
          })
        }}
        onStart={() => void startControl()}
      />
    )
  }

  return (
    <AppTakeover
      className={cn("bg-black text-white", isTotemMode && "select-none")}
    >
      <DoorScannerSessionChrome
        isTotem={isTotemMode}
        gateLabel={selectedGate?.label ?? "Gatera"}
        online={online}
        admittedCount={admittedCount}
        torchOn={torchOn}
        torchAvailable={torchAvailable}
        wakeLockHeld={wakeLockHeld}
        onChangeGate={() => {
          stopLeaseGossip()
          setSessionActive(false)
          setCameraError(null)
          setTorchOn(false)
        }}
        onSearch={() => setSearchOpen(true)}
        onToggleTorch={() => void toggleTorch()}
        overlay={
          isTotemMode ? (
            <TotemRestOverlay enabled onScan={validateTicketToken} />
          ) : null
        }
        camera={
          cameraError ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <CameraOff className="mx-auto size-12 text-amber-400" />
                <p className="mt-4 text-xl font-bold">Camara bloqueada</p>
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
              scanDelay={150}
              allowMultiple={false}
              paused={isPending || overlay != null || searchOpen}
              classNames={{
                container: "relative z-0 h-full w-full overflow-hidden",
                video: "pointer-events-none",
              }}
              styles={{
                container: { width: "100%", height: "100%" },
                video: { objectFit: "cover", pointerEvents: "none" },
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
      {overlay ? <ScanResultOverlay state={overlay} /> : null}
    </AppTakeover>
  )
}
