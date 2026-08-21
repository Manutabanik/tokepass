export const PRINT_BATCH_MAX_TICKETS = 1000
export const PRINT_SERIAL_PAD = 5
export const PRINT_SERIES_RE = /^[A-Z0-9]{1,8}$/
export const PRINT_NAME_MIN = 2
export const PRINT_NAME_MAX = 80

export const PRINT_BATCH_MODES = [
  "unnamed",
  "named",
  "seated",
  "accreditation",
] as const

export const PRINT_BATCH_CHANNELS = [
  "batch_print",
  "complimentary",
  "accreditation",
] as const

export const PRINT_TEMPLATE_MEDIA = [
  "press_sheet",
  "thermal_80",
  "thermal_58",
  "badge",
  "wristband",
] as const

export type PrintBatchMode = (typeof PRINT_BATCH_MODES)[number]
export type PrintBatchChannel = (typeof PRINT_BATCH_CHANNELS)[number]
export type PrintTemplateMedium = (typeof PRINT_TEMPLATE_MEDIA)[number]

export function formatPrintSerialLabel(seriesCode: string, seq: number): string {
  const series = seriesCode.trim().toUpperCase()
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error("INVALID_SEQ")
  }
  return `${series}-${String(seq).padStart(PRINT_SERIAL_PAD, "0")}`
}

export function normalizePrintSeriesCode(
  raw: string | null | undefined,
): string | null {
  const series = (raw ?? "A").trim().toUpperCase()
  return PRINT_SERIES_RE.test(series) ? series : null
}

export function normalizePrintBatchName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").trim()
  if (name.length < PRINT_NAME_MIN || name.length > PRINT_NAME_MAX) return null
  return name
}

export function isPrintBatchMode(value: string): value is PrintBatchMode {
  return (PRINT_BATCH_MODES as readonly string[]).includes(value)
}

export function isPrintBatchChannel(value: string): value is PrintBatchChannel {
  return (PRINT_BATCH_CHANNELS as readonly string[]).includes(value)
}

export function isPrintTemplateMedium(value: string): value is PrintTemplateMedium {
  return (PRINT_TEMPLATE_MEDIA as readonly string[]).includes(value)
}

export function printBatchNeedsGuests(mode: PrintBatchMode): boolean {
  return mode === "named" || mode === "seated"
}

export const PRINT_STUDIO_DEMO_QR = "TPS.DEMO.12345678"
export const PRINT_STUDIO_DEMO_HOLDER = "CARLOS MENDOZA"
export const PRINT_STUDIO_DEMO_ROLE = "TÉCNICA / ESCENARIO"
export const PRINT_STUDIO_DEMO_COMPANY = "SONIDO XYZ"
export const PRINT_STUDIO_STUB_MM = 30
export const PRINT_STUDIO_BRAND_MARK = "/brand/tokepass-mark.png"
export const ACCREDITATION_OPERATIONAL_TIER_NAME = "Acreditaciones (operativo)"

export function printChannelUsesCommercialStock(channel: string): boolean {
  return channel !== "accreditation"
}

export const SCREEN_DPI = 96
export const MM_PER_INCH = 25.4
export const MM_TO_PX_96DPI = SCREEN_DPI / MM_PER_INCH

export const ACCREDITATION_ROLES = [
  "Técnica",
  "Prensa",
  "VIP",
  "Producción",
] as const

export type AccreditationRole = (typeof ACCREDITATION_ROLES)[number]

export type PrintTemplateZoneId =
  | "qr"
  | "folio"
  | "holder"
  | "role"
  | "disclaimer"
  | "eventTitle"
  | "logo"
  | "sponsors"

export type PrintTemplateZone = {
  id: PrintTemplateZoneId
  enabled: boolean
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export type PrintTemplateLayout = {
  version: 1
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  flapMm: number
  disclaimerText: string
  zones: PrintTemplateZone[]
}

export type PrintTemplateAssets = {
  logoUrl: string
  bannerUrl: string
  sponsorUrls: string[]
}

export type PrintMediumPresetId =
  | "carton_150"
  | "carton_flap"
  | "badge"
  | "thermal_80"
  | "thermal_58"
  | "wristband"

export type PrintMediumPreset = {
  id: PrintMediumPresetId
  medium: PrintTemplateMedium
  label: string
  hint: string
  widthMm: number
  heightMm: number
  flapMm: number
}

export const PRINT_MEDIUM_PRESETS: PrintMediumPreset[] = [
  {
    id: "carton_150",
    medium: "press_sheet",
    label: "Cartón entrada",
    hint: "150 x 70 mm",
    widthMm: 150,
    heightMm: 70,
    flapMm: 0,
  },
  {
    id: "carton_flap",
    medium: "press_sheet",
    label: "Cartón con solapa",
    hint: "200 x 80 mm",
    widthMm: 200,
    heightMm: 80,
    flapMm: 50,
  },
  {
    id: "badge",
    medium: "badge",
    label: "Acreditación / Badge",
    hint: "100 x 150 mm",
    widthMm: 100,
    heightMm: 150,
    flapMm: 0,
  },
  {
    id: "thermal_80",
    medium: "thermal_80",
    label: "Térmica POS 80 mm",
    hint: "80 x 120 mm",
    widthMm: 80,
    heightMm: 120,
    flapMm: 0,
  },
  {
    id: "thermal_58",
    medium: "thermal_58",
    label: "Térmica 58 mm",
    hint: "58 x 100 mm",
    widthMm: 58,
    heightMm: 100,
    flapMm: 0,
  },
  {
    id: "wristband",
    medium: "wristband",
    label: "Pulsera",
    hint: "254 x 25 mm",
    widthMm: 254,
    heightMm: 25,
    flapMm: 0,
  },
]

export const PRINT_TEMPLATE_ZONE_LABELS: Record<PrintTemplateZoneId, string> = {
  qr: "Código QR",
  folio: "Folio visible",
  holder: "Nombre del asistente / staff",
  role: "Rol de acreditación",
  disclaimer: "Disclaimer legal",
  eventTitle: "Nombre del evento",
  logo: "Logo del evento",
  sponsors: "Logos de sponsors",
}

const DEFAULT_DISCLAIMER =
  "Entrada personal e intransferible. Válida solo con documento. TokePass no se responsabiliza por copias."

export function mmToScreenPx(mm: number, dpi = SCREEN_DPI): number {
  return (mm * dpi) / MM_PER_INCH
}

export function screenPxToMm(px: number, dpi = SCREEN_DPI): number {
  return (px * MM_PER_INCH) / dpi
}

export function formatPrintFolioPreview(seriesCode: string, seq: number): string {
  const series = normalizePrintSeriesCode(seriesCode) ?? "A"
  const padded = String(Math.max(1, Math.floor(seq))).padStart(PRINT_SERIAL_PAD, "0")
  return `SERIE ${series} - N° ${padded}`
}

export function formatPrintSerialRange(start: number, end: number): string {
  const from = String(Math.max(1, Math.floor(start))).padStart(PRINT_SERIAL_PAD, "0")
  const to = String(Math.max(1, Math.floor(end))).padStart(PRINT_SERIAL_PAD, "0")
  return `${from} - ${to}`
}

export function printBatchChannelLabel(channel: string): string {
  if (channel === "batch_print") return "Imprenta"
  if (channel === "complimentary") return "Cortesía"
  if (channel === "accreditation") return "Acreditación"
  return channel
}

export function printBatchStatusLabel(status: string, issuedCount: number): string {
  if (status === "void") return "Anulado"
  if (status === "draft") return "Borrador"
  if (issuedCount > 0) return "Emitido"
  return "Listo"
}

export function printTemplateMediumLabel(medium: string): string {
  const preset = PRINT_MEDIUM_PRESETS.find((item) => item.medium === medium)
  return preset?.label ?? medium
}

export function matchMediumPreset(
  medium: PrintTemplateMedium,
  widthMm: number,
  heightMm: number,
): PrintMediumPreset {
  const exact = PRINT_MEDIUM_PRESETS.find(
    (item) =>
      item.medium === medium &&
      item.widthMm === widthMm &&
      item.heightMm === heightMm,
  )
  if (exact) return exact
  return (
    PRINT_MEDIUM_PRESETS.find((item) => item.medium === medium) ??
    PRINT_MEDIUM_PRESETS[0]
  )
}

function zone(
  id: PrintTemplateZoneId,
  enabled: boolean,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
): PrintTemplateZone {
  return { id, enabled, xMm, yMm, widthMm, heightMm }
}

export function defaultZonesForPage(
  widthMm: number,
  heightMm: number,
  medium: PrintTemplateMedium,
): PrintTemplateZone[] {
  if (medium === "wristband") {
    return [
      zone("logo", true, 3, 4, 22, 17),
      zone("eventTitle", true, 28, 3, 70, 10),
      zone("folio", true, 28, 13, 80, 9),
      zone("holder", false, 110, 4, 50, 17),
      zone("role", false, 162, 4, 36, 17),
      zone("qr", true, 220, 2, 21, 21),
      zone("disclaimer", false, 3, 21, 200, 3),
      zone("sponsors", false, 162, 4, 36, 17),
    ]
  }

  if (medium === "badge") {
    return [
      zone("logo", true, 8, 8, 28, 16),
      zone("eventTitle", true, 8, 28, 84, 14),
      zone("role", true, 8, 46, 84, 14),
      zone("holder", true, 8, 64, 84, 12),
      zone("qr", true, 26, 82, 48, 48),
      zone("folio", true, 8, 134, 84, 8),
      zone("disclaimer", true, 8, 143, 84, 5),
      zone("sponsors", false, 62, 8, 30, 16),
    ]
  }

  if (medium === "thermal_80" || medium === "thermal_58") {
    const w = Math.max(50, widthMm - 8)
    return [
      zone("logo", true, 4, 4, w * 0.4, 12),
      zone("eventTitle", true, 4, 18, w, 10),
      zone("folio", true, 4, 30, w, 8),
      zone("holder", true, 4, 40, w, 8),
      zone("role", medium === "thermal_80", 4, 50, w, 8),
      zone("qr", true, (widthMm - 36) / 2, 62, 36, 36),
      zone("disclaimer", true, 4, heightMm - 10, w, 7),
      zone("sponsors", false, 4, heightMm - 22, w, 10),
    ]
  }

  return [
    zone("logo", true, 5, 5, 28, 12),
    zone("eventTitle", true, 36, 5, Math.max(40, widthMm - 78), 12),
    zone("holder", true, 5, 22, Math.max(50, widthMm - 48), 10),
    zone("role", false, 5, 34, 60, 8),
    zone("folio", true, 5, heightMm - 18, 62, 12),
    zone("qr", true, widthMm - 34, 20, 28, 28),
    zone("disclaimer", true, 5, heightMm - 7, Math.max(70, widthMm - 12), 5),
    zone("sponsors", true, widthMm - 40, heightMm - 18, 34, 12),
  ]
}

export function defaultTemplateLayout(
  medium: PrintTemplateMedium = "press_sheet",
  widthMm = 150,
  heightMm = 70,
  flapMm = 0,
): PrintTemplateLayout {
  return {
    version: 1,
    primaryColor: "#052e16",
    secondaryColor: "#059669",
    backgroundColor: "#f8fafc",
    flapMm,
    disclaimerText: DEFAULT_DISCLAIMER,
    zones: defaultZonesForPage(widthMm, heightMm, medium),
  }
}

export function defaultTemplateAssets(): PrintTemplateAssets {
  return { logoUrl: "", bannerUrl: "", sponsorUrls: [] }
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}

function readNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function parseTemplateLayout(
  raw: unknown,
  medium: PrintTemplateMedium = "press_sheet",
  widthMm = 150,
  heightMm = 70,
): PrintTemplateLayout {
  const fallback = defaultTemplateLayout(medium, widthMm, heightMm)
  if (!raw || typeof raw !== "object") return fallback
  const row = raw as Record<string, unknown>
  const zonesRaw = Array.isArray(row.zones) ? row.zones : []
  const byId = new Map<PrintTemplateZoneId, PrintTemplateZone>()
  for (const item of zonesRaw) {
    if (!item || typeof item !== "object") continue
    const zoneRow = item as Record<string, unknown>
    const id = zoneRow.id
    if (typeof id !== "string" || !(id in PRINT_TEMPLATE_ZONE_LABELS)) continue
    const zoneId = id as PrintTemplateZoneId
    byId.set(zoneId, {
      id: zoneId,
      enabled: Boolean(zoneRow.enabled),
      xMm: readNumber(zoneRow.xMm, 0),
      yMm: readNumber(zoneRow.yMm, 0),
      widthMm: Math.max(4, readNumber(zoneRow.widthMm, 20)),
      heightMm: Math.max(4, readNumber(zoneRow.heightMm, 8)),
    })
  }
  return {
    version: 1,
    primaryColor: isHexColor(String(row.primaryColor ?? ""))
      ? String(row.primaryColor)
      : fallback.primaryColor,
    secondaryColor: isHexColor(String(row.secondaryColor ?? ""))
      ? String(row.secondaryColor)
      : fallback.secondaryColor,
    backgroundColor: isHexColor(String(row.backgroundColor ?? ""))
      ? String(row.backgroundColor)
      : fallback.backgroundColor,
    flapMm: Math.max(0, readNumber(row.flapMm, fallback.flapMm)),
    disclaimerText:
      typeof row.disclaimerText === "string" && row.disclaimerText.trim()
        ? row.disclaimerText.trim()
        : fallback.disclaimerText,
    zones: fallback.zones.map((item) => byId.get(item.id) ?? item),
  }
}

export function parseTemplateAssets(raw: unknown): PrintTemplateAssets {
  const fallback = defaultTemplateAssets()
  if (!raw || typeof raw !== "object") return fallback
  const row = raw as Record<string, unknown>
  const sponsors = Array.isArray(row.sponsorUrls)
    ? row.sponsorUrls
    : typeof row.sponsorUrls === "string"
      ? String(row.sponsorUrls).split(/\n|,/)
      : []
  return {
    logoUrl: typeof row.logoUrl === "string" ? row.logoUrl.trim() : "",
    bannerUrl: typeof row.bannerUrl === "string" ? row.bannerUrl.trim() : "",
    sponsorUrls: sponsors
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0)
      .slice(0, 6),
  }
}

export function clampZoneToPage(
  zone: PrintTemplateZone,
  widthMm: number,
  heightMm: number,
): PrintTemplateZone {
  const width = Math.min(Math.max(4, zone.widthMm), widthMm)
  const height = Math.min(Math.max(4, zone.heightMm), heightMm)
  return {
    ...zone,
    widthMm: width,
    heightMm: height,
    xMm: Math.min(Math.max(0, zone.xMm), Math.max(0, widthMm - width)),
    yMm: Math.min(Math.max(0, zone.yMm), Math.max(0, heightMm - height)),
  }
}

export function moveZoneByMm(
  zone: PrintTemplateZone,
  dxMm: number,
  dyMm: number,
  widthMm: number,
  heightMm: number,
): PrintTemplateZone {
  return clampZoneToPage(
    { ...zone, xMm: zone.xMm + dxMm, yMm: zone.yMm + dyMm },
    widthMm,
    heightMm,
  )
}

export type AccreditationCsvGuest = {
  nombre: string
  apellido?: string
  dni?: string
  staffRole?: string
  staffCompany?: string
}

function splitCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if ((ch === "," || ch === ";") && !quoted) {
      cols.push(cur.trim())
      cur = ""
      continue
    }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

export function parseAccreditationCsv(text: string): AccreditationCsvGuest[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const header = splitCsvLine(lines[0]).map((item) => item.toLowerCase())
  const hasHeader = header.some((item) =>
    ["nombre", "name", "dni", "rol", "role", "empresa", "company"].includes(item),
  )
  const start = hasHeader ? 1 : 0
  const idx = (names: string[]) =>
    hasHeader ? names.reduce((acc, name) => (acc >= 0 ? acc : header.indexOf(name)), -1) : -1

  const iNombre = idx(["nombre", "name"])
  const iApellido = idx(["apellido", "last_name", "lastname"])
  const iDni = idx(["dni", "documento"])
  const iRol = idx(["rol", "role", "staff_role", "cargo"])
  const iEmpresa = idx(["empresa", "company", "staff_company", "medio"])

  const rows: AccreditationCsvGuest[] = []
  for (let i = start; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i])
    const nombre = hasHeader ? (cols[iNombre] ?? "") : (cols[0] ?? "")
    const apellido = hasHeader
      ? iApellido >= 0
        ? (cols[iApellido] ?? "")
        : ""
      : (cols[1] ?? "")
    const dni = hasHeader ? (cols[iDni] ?? "") : (cols[2] ?? "")
    const staffRole = hasHeader
      ? iRol >= 0
        ? (cols[iRol] ?? "")
        : ""
      : (cols[3] ?? "")
    const staffCompany = hasHeader
      ? iEmpresa >= 0
        ? (cols[iEmpresa] ?? "")
        : ""
      : (cols[4] ?? "")
    if (!nombre.trim() && !dni.trim()) continue
    rows.push({
      nombre: nombre.trim(),
      apellido: apellido.trim() || undefined,
      dni: dni.trim() || undefined,
      staffRole: staffRole.trim() || undefined,
      staffCompany: staffCompany.trim() || undefined,
    })
  }
  return rows
}

export function previewScaleToFit(
  pageWidthMm: number,
  pageHeightMm: number,
  availWidthPx: number,
  availHeightPx: number,
): number {
  const widthPx = mmToScreenPx(pageWidthMm)
  const heightPx = mmToScreenPx(pageHeightMm)
  if (widthPx <= 0 || heightPx <= 0) return 1
  return Math.min(1, availWidthPx / widthPx, availHeightPx / heightPx)
}
