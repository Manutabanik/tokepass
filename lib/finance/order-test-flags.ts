import { isSandboxEventStatus } from "@/lib/events/review-status"

export type OrderCommerceEnvironment = "production" | "test"

export function orderTestFlags(isTest: boolean): {
  is_test: boolean
  environment: OrderCommerceEnvironment
} {
  return isTest
    ? { is_test: true, environment: "test" }
    : { is_test: false, environment: "production" }
}

export function shouldMarkOrderAsTest(input: {
  eventStatus?: string | null
  sandbox?: boolean
}): boolean {
  return Boolean(input.sandbox) || isSandboxEventStatus(input.eventStatus)
}

export function isSandboxIssuedOrder(row: {
  is_test?: boolean | null
  payment_method?: string | null
  environment?: string | null
}): boolean {
  return (
    row.is_test === true ||
    row.payment_method === "test_sandbox" ||
    row.environment === "test"
  )
}
