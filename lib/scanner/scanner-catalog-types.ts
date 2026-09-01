import type { QrType } from "@/types/database"

export type ScannerEventOption = {
  id: string
  title: string
  date: string
  status: string
  qrType: QrType
}
