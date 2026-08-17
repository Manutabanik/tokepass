/**
 * Bus local de leases entre pestañas / PWAs del mismo origen (BroadcastChannel).
 * No sustituye el rango por pistola entre dos teléfonos sin red.
 */

import type { AdmissionLeaseRecord } from "@/lib/scanner/admission-lease"

const CHANNEL_NAME = "tokepass-scan-lease-v1"
const PEER_TTL_MS = 8_000

type HelloMessage = {
  v: 1
  type: "hello"
  eventId: string
  deviceId: string
}

type LeaseMessage = {
  v: 1
  type: "lease"
  eventId: string
  deviceId: string
  lease: AdmissionLeaseRecord
}

type GossipMessage = HelloMessage | LeaseMessage

let channel: BroadcastChannel | null = null
let startedFor: { eventId: string; deviceId: string } | null = null
let lastPeerAt = 0
let peerDevices = new Set<string>()
let onRemoteLease: ((lease: AdmissionLeaseRecord) => void) | null = null

function isGossipMessage(value: unknown): value is GossipMessage {
  if (!value || typeof value !== "object") return false
  const row = value as { v?: unknown; type?: unknown; eventId?: unknown }
  return row.v === 1 && typeof row.eventId === "string" && typeof row.type === "string"
}

function rememberPeer(deviceId: string) {
  if (!deviceId || deviceId === startedFor?.deviceId) return
  peerDevices.add(deviceId)
  lastPeerAt = Date.now()
}

export function hasLiveLeasePeers(now = Date.now()): boolean {
  if (peerDevices.size === 0) return false
  return now - lastPeerAt <= PEER_TTL_MS
}

export function publishAdmissionLease(lease: AdmissionLeaseRecord): void {
  if (!channel || !startedFor) return
  if (lease.event_id !== startedFor.eventId) return
  const message: LeaseMessage = {
    v: 1,
    type: "lease",
    eventId: startedFor.eventId,
    deviceId: startedFor.deviceId,
    lease,
  }
  try {
    channel.postMessage(message)
  } catch {
    // canal opcional
  }
}

export function startLeaseGossip(input: {
  eventId: string
  deviceId: string
  onRemoteLease: (lease: AdmissionLeaseRecord) => void
}): void {
  stopLeaseGossip()
  if (typeof BroadcastChannel === "undefined") return
  startedFor = { eventId: input.eventId, deviceId: input.deviceId }
  onRemoteLease = input.onRemoteLease
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isGossipMessage(event.data)) return
    if (event.data.eventId !== input.eventId) return
    rememberPeer(event.data.deviceId)
    if (event.data.type === "lease" && event.data.deviceId !== input.deviceId) {
      onRemoteLease?.(event.data.lease)
    }
  }
  const hello: HelloMessage = {
    v: 1,
    type: "hello",
    eventId: input.eventId,
    deviceId: input.deviceId,
  }
  try {
    channel.postMessage(hello)
  } catch {
    // hello opcional
  }
}

export function stopLeaseGossip(): void {
  if (channel) {
    channel.onmessage = null
    channel.close()
  }
  channel = null
  startedFor = null
  onRemoteLease = null
  peerDevices = new Set()
  lastPeerAt = 0
}
