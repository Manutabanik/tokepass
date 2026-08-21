import { NextResponse } from "next/server"
import { ZodError } from "zod"

import {
  isAppErrorCode,
  type AppErrorCode,
} from "@/lib/errors/app-error"
import { mapUnknownError } from "@/lib/errors/error-handler"
import {
  GENERIC_PUBLIC_ERROR,
  toUserFacingError,
} from "@/lib/errors/user-facing-error"
import { logger } from "@/lib/logger"

export type PublicHttpStatus = 400 | 401 | 403 | 404 | 409 | 500

export type PublicHttpError = {
  status: PublicHttpStatus
  code: string
  message: string
}

const STATUS_BY_APP_CODE: Record<AppErrorCode, PublicHttpStatus> = {
  INVALID_DAY_SELECTION: 400,
  ERROR_FALTA_UBICACION: 400,
  MISSING_VENUE_NAME: 400,
  MISSING_TICKETS: 400,
  INVALID_EVENT_DATE: 400,
  INVENTORY_SYNC: 500,
  SEATING_SECTOR_MISMATCH: 409,
  CAPACITY_OVERFLOW: 409,
  PHASE_OVERFLOW: 409,
  PERMISSION_DENIED: 403,
  SESSION_REQUIRED: 401,
  EVENT_NOT_FOUND: 404,
  SAVE_FAILED: 500,
  INVALID_PROMO_PRICE: 400,
  MISSING_SCHEDULE_DAY: 400,
  INCOMPLETE_DAY_TICKETS: 400,
  FLYER_TOO_LARGE: 400,
  UNKNOWN: 500,
}

function statusForAppCode(code: string): PublicHttpStatus {
  if (isAppErrorCode(code)) return STATUS_BY_APP_CODE[code]
  return 500
}

export function toPublicHttpError(raw: unknown): PublicHttpError {
  if (raw instanceof ZodError) {
    return {
      status: 400,
      code: "VALIDATION",
      message: "Los datos enviados no son válidos.",
    }
  }

  const mapped = mapUnknownError(raw, {
    code: "SAVE_FAILED",
    title: "No pudimos guardar los cambios",
    message: GENERIC_PUBLIC_ERROR,
  })

  return {
    status: statusForAppCode(mapped.code),
    code: mapped.code,
    message: toUserFacingError(mapped.message, GENERIC_PUBLIC_ERROR),
  }
}

export function publicJsonError(
  raw: unknown,
  context: string,
  fallbackStatus: PublicHttpStatus = 500,
): NextResponse {
  const mapped = toPublicHttpError(raw)
  const status =
    mapped.status === 500 && fallbackStatus !== 500
      ? fallbackStatus
      : mapped.status

  logger.error({
    context,
    message: "public_api_error",
    code: mapped.code,
    status,
    error: raw,
  })

  return NextResponse.json(
    {
      success: false,
      error: mapped.message,
      code: mapped.code,
    },
    { status },
  )
}
