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
