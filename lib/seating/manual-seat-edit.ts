export type ManualSeatFields = {
  label: string
  row: string
  number: string
}

const MATRIX_LABEL =
  /^(?:Fila\s+)?([A-Za-z0-9]+)\s*[-–]\s*(?:Asiento\s+)?(\d+)\s*$/i
const COMPACT_LABEL = /^([A-Za-z]+)\s*-?\s*(\d+)$/

export function parseManualSeatFields(input: {
  label?: string | null
  row?: string | null
  number?: number | string | null
}): ManualSeatFields {
  const label = (input.label ?? "").trim()
  const fallbackRow = (input.row ?? "").trim()
  const fallbackNumber =
    input.number == null || input.number === ""
      ? ""
      : String(input.number)

  const matrix = MATRIX_LABEL.exec(label)
  if (matrix) {
    return {
      label,
      row: fallbackRow || matrix[1]!,
      number: fallbackNumber || matrix[2]!,
    }
  }

  const compact = COMPACT_LABEL.exec(label)
  if (compact) {
    return {
      label,
      row: fallbackRow || compact[1]!,
      number: fallbackNumber || compact[2]!,
    }
  }

  return {
    label,
    row: fallbackRow,
    number: fallbackNumber,
  }
}

export function composeManualSeatLabel(input: {
  row: string
  number: string
  fallbackLabel: string
}): string {
  const row = input.row.trim()
  const number = input.number.trim()
  if (row && number) return `Fila ${row} - Asiento ${number}`
  if (number) return number
  if (row) return `Fila ${row}`
  return input.fallbackLabel.trim()
}

export function parseSeatNumberInput(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(1, Math.round(parsed))
}
