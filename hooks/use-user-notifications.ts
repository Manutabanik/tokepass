"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import {
  getBuyerNotifications,
  type BuyerNotification,
} from "@/app/actions/buyer-notifications"
import {
  getReadNotificationSnapshot,
  markNotificationRead,
  markNotificationsRead,
  subscribeNotificationReads,
} from "@/lib/buyer-notifications-read"

export type UserNotificationsState = {
  notifications: BuyerNotification[]
  unread: BuyerNotification[]
  unreadCount: number
  unreadByTab: {
    entradas: boolean
    perfil: boolean
    compras: boolean
    inicio: boolean
  }
  hasUnread: boolean
  loading: boolean
  refresh: () => void
  markRead: (id: string) => void
  markAllRead: () => void
}

export function useUserNotifications(): UserNotificationsState {
  const [notifications, setNotifications] = useState<BuyerNotification[]>([])
  const readIds = useSyncExternalStore(
    subscribeNotificationReads,
    getReadNotificationSnapshot,
    getReadNotificationSnapshot,
  )
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [loadTick, setLoadTick] = useState(tick)
  if (tick !== loadTick) {
    setLoadTick(tick)
    setLoading(true)
  }

  const refresh = useCallback(() => {
    setTick((value) => value + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    void getBuyerNotifications()
      .then((items) => {
        if (!cancelled) setNotifications(items)
      })
      .catch(() => {
        if (!cancelled) setNotifications([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tick])

  useEffect(() => {
    function onFocus() {
      refresh()
    }
    window.addEventListener("focus", onFocus)
    const interval = window.setInterval(() => refresh(), 90_000)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.clearInterval(interval)
    }
  }, [refresh])

  const unread = useMemo(
    () => notifications.filter((item) => !readIds.has(item.id)),
    [notifications, readIds],
  )

  const unreadByTab = useMemo(
    () => ({
      entradas: unread.some((item) => item.tab === "entradas"),
      perfil: unread.some((item) => item.tab === "perfil"),
      compras: unread.some((item) => item.tab === "compras"),
      inicio: unread.length > 0,
    }),
    [unread],
  )

  const markRead = useCallback((id: string) => {
    markNotificationRead(id)
  }, [])

  const markAllRead = useCallback(() => {
    markNotificationsRead(notifications.map((item) => item.id))
  }, [notifications])

  return {
    notifications,
    unread,
    unreadCount: unread.length,
    unreadByTab,
    hasUnread: unread.length > 0,
    loading,
    refresh,
    markRead,
    markAllRead,
  }
}
