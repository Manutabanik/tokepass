export type UserRole = "customer" | "admin" | "super_admin"
export type EventStatus = "draft" | "published" | "cancelled" | "completed"
export type QrType = "dynamic" | "static"
export type PaymentMethod = "mercadopago" | "cash_pos" | "transfer_pos"
export type TicketStatus =
  | "valid"
  | "transferred"
  | "used"
  | "cancelled"
  /** @deprecated legacy — migrado a `used` */
  | "scanned"
  /** @deprecated legacy — migrado a `cancelled` */
  | "revoked"
export type ZoneType = "general_admission" | "reserved_seating"
export type SeatStatus = "available" | "locked" | "sold"
export type OrderStatus = "pending" | "paid" | "failed"
export type GuestListEntryStatus = "pending" | "claimed" | "checked_in"
export type ItemRedemptionStatus =
  | "pending"
  | "valid"
  | "redeemed"
  | "cancelled"

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Profile = {
  id: string
  email: string
  full_name: string | null
  dni: string | null
  role: UserRole
  /** Fracción decimal: 0.15 = 15% cargo por servicio al comprador */
  service_charge_rate: number
  created_at: string
  updated_at: string
}

export type Event = {
  id: string
  title: string
  description: string | null
  date: string
  location: string
  image_url: string | null
  flyer_url: string | null
  status: EventStatus
  organizer_id: string
  venue_id: string | null
  max_tickets_per_user: number
  qr_type: QrType
  created_at: string
  updated_at: string
}

export type Venue = {
  id: string
  organizer_id: string
  name: string
  location: string
  capacity: number
  created_at: string
  updated_at: string
}

export type TicketTier = {
  id: string
  event_id: string
  name: string
  price: number
  capacity: number
  sold: number
  time_limit: string | null
  bonus_reward: string | null
  zone_id: string | null
  created_at: string
  updated_at: string
}

export type Ticket = {
  id: string
  event_id: string
  tier_id: string
  owner_id: string | null
  qr_code: string
  totp_secret: string
  status: TicketStatus
  order_id: string | null
  seat_id: string | null
  is_dynamic_qr: boolean
  max_transfers_allowed: number
  transfer_count: number
  scanned_at: string | null
  created_at: string
  updated_at: string
}

export type TicketTransfer = {
  id: string
  sender_id: string
  receiver_email: string
  original_ticket_id: string
  new_ticket_id: string | null
  created_at: string
}

export type MpWebhookEvent = {
  payment_id: string
  order_id: string | null
  status: string
  processed_at: string
  raw_summary: Json | null
}

export type EventZone = {
  id: string
  event_id: string
  name: string
  type: ZoneType
  capacity: number
  created_at: string
  updated_at: string
}

export type Seat = {
  id: string
  zone_id: string
  row_label: string
  seat_number: string
  status: SeatStatus
  created_at: string
  updated_at: string
}

export type Promoter = {
  id: string
  organizer_id: string
  user_id: string | null
  name: string
  /** Fracción decimal: 0.10 = 10% */
  commission_rate: number
  referral_code: string
  created_at: string
  updated_at: string
}

export type Addon = {
  id: string
  event_id: string
  name: string
  price: number
  stock: number
  created_at: string
  updated_at: string
}

export type Order = {
  id: string
  buyer_id: string
  /** Costo de tickets */
  subtotal: number
  /** Ganancia plataforma */
  service_charge: number
  /** subtotal + service_charge */
  total_amount: number
  status: OrderStatus
  promoter_id: string | null
  mp_preference_id: string | null
  mp_payment_id: string | null
  payment_method: PaymentMethod
  customer_phone: string | null
  created_at: string
  updated_at: string
}

export type OrderAddon = {
  id: string
  order_id: string
  addon_id: string
  quantity: number
  unit_price: number
  created_at: string
  updated_at: string
}

export type GuestList = {
  id: string
  event_id: string
  name: string
  max_guests: number
  valid_until: string
  created_at: string
  updated_at: string
}

export type GuestListEntry = {
  id: string
  guest_list_id: string
  full_name: string
  email: string | null
  phone: string | null
  status: GuestListEntryStatus
  ticket_id: string | null
  created_at: string
  updated_at: string
}

export type EventItem = {
  id: string
  event_id: string
  name: string
  description: string | null
  price: number
  stock: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ItemRedemption = {
  id: string
  order_id: string
  item_id: string
  user_id: string
  qr_code_token: string
  status: ItemRedemptionStatus
  redeemed_at: string | null
  redeemed_by: string | null
  created_at: string
  updated_at: string
}

type ProfileInsert = Omit<
  Profile,
  "role" | "created_at" | "updated_at" | "service_charge_rate" | "dni"
> & {
  role?: UserRole
  service_charge_rate?: number
  dni?: string | null
  created_at?: string
  updated_at?: string
}
type EventInsert = Omit<
  Event,
  | "id"
  | "description"
  | "image_url"
  | "flyer_url"
  | "venue_id"
  | "status"
  | "max_tickets_per_user"
  | "qr_type"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  description?: string | null
  image_url?: string | null
  flyer_url?: string | null
  venue_id?: string | null
  status?: EventStatus
  max_tickets_per_user?: number
  qr_type?: QrType
  created_at?: string
  updated_at?: string
}
type VenueInsert = Omit<Venue, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}
type TicketTierInsert = Omit<
  TicketTier,
  | "id"
  | "sold"
  | "time_limit"
  | "bonus_reward"
  | "zone_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  sold?: number
  time_limit?: string | null
  bonus_reward?: string | null
  zone_id?: string | null
  created_at?: string
  updated_at?: string
}
type TicketInsert = Omit<
  Ticket,
  | "id"
  | "status"
  | "order_id"
  | "seat_id"
  | "is_dynamic_qr"
  | "totp_secret"
  | "max_transfers_allowed"
  | "transfer_count"
  | "scanned_at"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: TicketStatus
  order_id?: string | null
  seat_id?: string | null
  is_dynamic_qr?: boolean
  totp_secret?: string
  max_transfers_allowed?: number
  transfer_count?: number
  scanned_at?: string | null
  created_at?: string
  updated_at?: string
}
type EventZoneInsert = Omit<EventZone, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}
type SeatInsert = Omit<
  Seat,
  "id" | "status" | "created_at" | "updated_at"
> & {
  id?: string
  status?: SeatStatus
  created_at?: string
  updated_at?: string
}
type PromoterInsert = Omit<Promoter, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}
type AddonInsert = Omit<Addon, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}
type OrderInsert = Omit<
  Order,
  | "id"
  | "status"
  | "subtotal"
  | "service_charge"
  | "promoter_id"
  | "mp_preference_id"
  | "mp_payment_id"
  | "payment_method"
  | "customer_phone"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: OrderStatus
  subtotal?: number
  service_charge?: number
  promoter_id?: string | null
  mp_preference_id?: string | null
  mp_payment_id?: string | null
  payment_method?: PaymentMethod
  customer_phone?: string | null
  created_at?: string
  updated_at?: string
}
type OrderAddonInsert = Omit<
  OrderAddon,
  "id" | "created_at" | "updated_at"
> & {
  id?: string
  created_at?: string
  updated_at?: string
}

type GuestListInsert = Omit<GuestList, "id" | "created_at" | "updated_at"> & {
  id?: string
  created_at?: string
  updated_at?: string
}

type GuestListEntryInsert = Omit<
  GuestListEntry,
  "id" | "status" | "ticket_id" | "email" | "phone" | "created_at" | "updated_at"
> & {
  id?: string
  status?: GuestListEntryStatus
  ticket_id?: string | null
  email?: string | null
  phone?: string | null
  created_at?: string
  updated_at?: string
}

type EventItemInsert = Omit<
  EventItem,
  | "id"
  | "description"
  | "is_active"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  description?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

type ItemRedemptionInsert = Omit<
  ItemRedemption,
  | "id"
  | "status"
  | "redeemed_at"
  | "redeemed_by"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: ItemRedemptionStatus
  redeemed_at?: string | null
  redeemed_by?: string | null
  created_at?: string
  updated_at?: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: Partial<ProfileInsert>
        Relationships: []
      }
      events: {
        Row: Event
        Insert: EventInsert
        Update: Partial<EventInsert>
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: Venue
        Insert: VenueInsert
        Update: Partial<VenueInsert>
        Relationships: []
      }
      ticket_tiers: {
        Row: TicketTier
        Insert: TicketTierInsert
        Update: Partial<TicketTierInsert>
        Relationships: []
      }
      tickets: {
        Row: Ticket
        Insert: TicketInsert
        Update: Partial<TicketInsert>
        Relationships: []
      }
      event_zones: {
        Row: EventZone
        Insert: EventZoneInsert
        Update: Partial<EventZoneInsert>
        Relationships: []
      }
      seats: {
        Row: Seat
        Insert: SeatInsert
        Update: Partial<SeatInsert>
        Relationships: []
      }
      promoters: {
        Row: Promoter
        Insert: PromoterInsert
        Update: Partial<PromoterInsert>
        Relationships: []
      }
      addons: {
        Row: Addon
        Insert: AddonInsert
        Update: Partial<AddonInsert>
        Relationships: []
      }
      orders: {
        Row: Order
        Insert: OrderInsert
        Update: Partial<OrderInsert>
        Relationships: []
      }
      order_addons: {
        Row: OrderAddon
        Insert: OrderAddonInsert
        Update: Partial<OrderAddonInsert>
        Relationships: []
      }
      guest_lists: {
        Row: GuestList
        Insert: GuestListInsert
        Update: Partial<GuestListInsert>
        Relationships: []
      }
      guest_list_entries: {
        Row: GuestListEntry
        Insert: GuestListEntryInsert
        Update: Partial<GuestListEntryInsert>
        Relationships: []
      }
      event_items: {
        Row: EventItem
        Insert: EventItemInsert
        Update: Partial<EventItemInsert>
        Relationships: []
      }
      item_redemptions: {
        Row: ItemRedemption
        Insert: ItemRedemptionInsert
        Update: Partial<ItemRedemptionInsert>
        Relationships: []
      }
      ticket_transfers: {
        Row: TicketTransfer
        Insert: Omit<TicketTransfer, "id" | "new_ticket_id" | "created_at"> & {
          id?: string
          new_ticket_id?: string | null
          created_at?: string
        }
        Update: Partial<TicketTransfer>
        Relationships: []
      }
      mp_webhook_events: {
        Row: MpWebhookEvent
        Insert: {
          payment_id: string
          order_id?: string | null
          status: string
          processed_at?: string
          raw_summary?: Json | null
        }
        Update: Partial<MpWebhookEvent>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      reserve_tickets_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_items: Json
          p_promoter_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          subtotal: number
          service_charge: number
          total_amount: number
        }[]
      }
      get_event_service_charge_rate: {
        Args: {
          p_event_id: string
        }
        Returns: number
      }
      create_complete_event_tx: {
        Args: {
          payload: Json
          p_organizer_id: string
        }
        Returns: string
      }
      get_organizer_metrics: {
        Args: {
          p_organizer_id: string
        }
        Returns: Json
      }
      release_reserved_tickets: {
        Args: {
          p_ticket_ids: string[]
        }
        Returns: undefined
      }
      resolve_promoter_for_checkout: {
        Args: {
          p_referral_code: string
          p_event_id: string
        }
        Returns: string | null
      }
      claim_promoter_by_code: {
        Args: {
          p_code: string
        }
        Returns: string
      }
      ensure_freepass_tier: {
        Args: { p_event_id: string }
        Returns: string
      }
      register_guest_list_entry: {
        Args: {
          p_list_id: string
          p_full_name: string
          p_email?: string | null
          p_phone?: string | null
        }
        Returns: string
      }
      claim_guest_list_entry: {
        Args: {
          p_entry_id: string
          p_owner_id: string
        }
        Returns: string
      }
      get_guest_list_public: {
        Args: { p_list_id: string }
        Returns: {
          id: string
          name: string
          max_guests: number
          used_guests: number
          remaining: number
          valid_until: string
          event_id: string
          event_title: string
          event_date: string
        }[]
      }
      mark_guest_entry_checked_in: {
        Args: { p_ticket_id: string }
        Returns: undefined
      }
      attach_event_items_to_order: {
        Args: {
          p_order_id: string
          p_owner_id: string
          p_items: Json
        }
        Returns: number
      }
      release_order_event_items: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      activate_order_item_redemptions: {
        Args: { p_order_id: string }
        Returns: number
      }
      redeem_item: {
        Args: {
          p_qr_token: string
          p_staff_user_id: string
        }
        Returns: {
          redemption_id: string
          item_name: string
          item_description: string | null
          redeemed_at: string | null
          already_redeemed: boolean
          previous_redeemed_at: string | null
        }[]
      }
      execute_safe_transfer: {
        Args: {
          p_ticket_id: string
          p_receiver_email: string
        }
        Returns: {
          transfer_id: string
          new_ticket_id: string
          event_title: string
          receiver_email: string
          receiver_user_id: string | null
        }[]
      }
      claim_pending_ticket_transfers: {
        Args: { p_user_id: string }
        Returns: number
      }
      create_pos_sale_tx: {
        Args: {
          p_event_id: string
          p_tier_id: string
          p_quantity: number
          p_payment_method: string
          p_staff_id: string
          p_customer_phone?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          totp_secret: string
          qr_code: string
          unit_price: number
          total_amount: number
        }[]
      }
    }
    Enums: {
      user_role: UserRole
      event_status: EventStatus
      ticket_status: TicketStatus
      zone_type: ZoneType
      seat_status: SeatStatus
      order_status: OrderStatus
    }
    CompositeTypes: Record<string, never>
  }
}
