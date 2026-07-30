export type UserRole = "customer" | "admin" | "super_admin"
export type OrganizerApprovalStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
export type EventStatus = "draft" | "published" | "cancelled" | "completed"
export type QrType = "dynamic" | "static"
export type PaymentMethod = "mercadopago" | "cash_pos" | "transfer_pos"
export type TicketStatus =
  | "pending_payment"
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
export type OrderStatus = "pending" | "paid" | "failed" | "expired"
export type EventStaffRole = "door_staff" | "bar_staff" | "cashier"

export type EventStaffAssignment = {
  id: string
  event_id: string
  user_id: string
  role: EventStaffRole
  created_by: string | null
  created_at: string
  is_active: boolean
  expires_at: string | null
}

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
  organizer_approval_status: OrganizerApprovalStatus
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
  /** public | private | guest_list_only */
  visibility: "public" | "private" | "guest_list_only"
  /** Jornadas: [{id,title,start_time,end_time}, ...] */
  schedule_days: Json
  is_featured: boolean
  featured_tier: "silver" | "gold" | "platinum" | null
  featured_until: string | null
  created_at: string
  updated_at: string
}

export type BoostSubscription = {
  id: string
  event_id: string
  organizer_id: string
  tier: "silver" | "gold" | "platinum"
  amount_paid: number
  duration_days: number
  payment_status: "pending" | "paid" | "failed" | "refunded"
  payment_id_mp: string | null
  created_at: string
  updated_at: string
}

export type Venue = {
  id: string
  organizer_id: string
  name: string
  location: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  capacity: number
  zone_blueprint: Json
  seating_layout: Json
  seating_background_url: string | null
  created_at: string
  updated_at: string
}

export type TicketTier = {
  id: string
  event_id: string
  name: string
  /** Precio final All-In publicado al comprador. */
  price: number
  /** Ingreso neto del organizador por entrada. */
  base_price: number
  /** Comisión unitaria Tokepass absorbida en `price`. */
  platform_fee: number
  capacity: number
  sold: number
  time_limit: string | null
  bonus_reward: string | null
  zone_id: string | null
  /** NULL = abono / fecha única; si no, id de schedule_days */
  day_id: string | null
  visibility: "public" | "private"
  layout_type: "general" | "table_combo" | "numbered_seat"
  seating_sector_id: string | null
  capacity_per_unit: number
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
  seating_unit_id: string | null
  max_admissions: number
  admissions_used: number
  is_dynamic_qr: boolean
  max_transfers_allowed: number
  transfer_count: number
  transferred_from_id: string | null
  scanned_at: string | null
  validated_at: string | null
  validated_by: string | null
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

export type EventSeatingUnit = {
  id: string
  event_id: string
  venue_id: string | null
  tier_id: string
  sector_id: string
  sector_name: string
  layout_item_id: string
  label: string
  row_id: string | null
  row_number: number | null
  row_label: string | null
  color: string
  layout_type: "table_combo" | "numbered_seat"
  capacity_per_unit: number
  status: "available" | "reserved" | "sold" | "blocked"
  reserved_by: string | null
  reserved_order_id: string | null
  reserved_until: string | null
  sold_order_id: string | null
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

export type OrganizerSettlement = {
  id: string
  organizer_id: string
  gross_amount: number
  platform_fee: number
  net_amount: number
  status: "pending" | "completed"
  period_label: string | null
  notes: string | null
  completed_at: string | null
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
  | "role"
  | "created_at"
  | "updated_at"
  | "service_charge_rate"
  | "dni"
  | "organizer_approval_status"
> & {
  role?: UserRole
  service_charge_rate?: number
  dni?: string | null
  organizer_approval_status?: OrganizerApprovalStatus
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
  | "visibility"
  | "schedule_days"
  | "is_featured"
  | "featured_tier"
  | "featured_until"
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
  visibility?: Event["visibility"]
  schedule_days?: Json
  is_featured?: boolean
  featured_tier?: Event["featured_tier"]
  featured_until?: string | null
  created_at?: string
  updated_at?: string
}
type VenueInsert = Omit<
  Venue,
  "id" | "seating_layout" | "seating_background_url" | "created_at" | "updated_at"
> & {
  id?: string
  seating_layout?: Json
  seating_background_url?: string | null
  created_at?: string
  updated_at?: string
}
type TicketTierInsert = Omit<
  TicketTier,
  | "id"
  | "sold"
  | "base_price"
  | "platform_fee"
  | "time_limit"
  | "bonus_reward"
  | "zone_id"
  | "day_id"
  | "visibility"
  | "layout_type"
  | "seating_sector_id"
  | "capacity_per_unit"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  sold?: number
  base_price?: number
  platform_fee?: number
  time_limit?: string | null
  bonus_reward?: string | null
  zone_id?: string | null
  day_id?: string | null
  visibility?: TicketTier["visibility"]
  layout_type?: TicketTier["layout_type"]
  seating_sector_id?: string | null
  capacity_per_unit?: number
  created_at?: string
  updated_at?: string
}
type TicketInsert = Omit<
  Ticket,
  | "id"
  | "status"
  | "order_id"
  | "seat_id"
  | "seating_unit_id"
  | "max_admissions"
  | "admissions_used"
  | "is_dynamic_qr"
  | "totp_secret"
  | "max_transfers_allowed"
  | "transfer_count"
  | "transferred_from_id"
  | "scanned_at"
  | "validated_at"
  | "validated_by"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: TicketStatus
  order_id?: string | null
  seat_id?: string | null
  seating_unit_id?: string | null
  max_admissions?: number
  admissions_used?: number
  is_dynamic_qr?: boolean
  totp_secret?: string
  max_transfers_allowed?: number
  transfer_count?: number
  transferred_from_id?: string | null
  scanned_at?: string | null
  validated_at?: string | null
  validated_by?: string | null
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
type EventSeatingUnitInsert = Omit<
  EventSeatingUnit,
  | "id"
  | "status"
  | "reserved_by"
  | "reserved_order_id"
  | "reserved_until"
  | "sold_order_id"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: EventSeatingUnit["status"]
  reserved_by?: string | null
  reserved_order_id?: string | null
  reserved_until?: string | null
  sold_order_id?: string | null
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
type OrganizerSettlementInsert = Omit<
  OrganizerSettlement,
  | "id"
  | "status"
  | "period_label"
  | "notes"
  | "completed_at"
  | "created_at"
  | "updated_at"
> & {
  id?: string
  status?: "pending" | "completed"
  period_label?: string | null
  notes?: string | null
  completed_at?: string | null
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
      boost_subscriptions: {
        Row: BoostSubscription
        Insert: {
          id?: string
          event_id: string
          organizer_id: string
          tier: BoostSubscription["tier"]
          amount_paid: number
          duration_days: number
          payment_status?: BoostSubscription["payment_status"]
          payment_id_mp?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<BoostSubscription>
        Relationships: []
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
      event_seating_units: {
        Row: EventSeatingUnit
        Insert: EventSeatingUnitInsert
        Update: Partial<EventSeatingUnitInsert>
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
      organizer_settlements: {
        Row: OrganizerSettlement
        Insert: OrganizerSettlementInsert
        Update: Partial<OrganizerSettlementInsert>
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
      event_staff_assignments: {
        Row: EventStaffAssignment
        Insert: {
          id?: string
          event_id: string
          user_id: string
          role: EventStaffRole
          created_by?: string | null
          created_at?: string
          is_active?: boolean
          expires_at?: string | null
        }
        Update: Partial<EventStaffAssignment>
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
      reserve_seating_unit_tx: {
        Args: {
          p_event_id: string
          p_owner_id: string
          p_tier_id: string
          p_seating_unit_id: string
          p_promoter_id?: string | null
        }
        Returns: {
          order_id: string
          ticket_id: string
          seating_unit_id: string
          reserved_until: string
          subtotal: number
          service_charge: number
          total_amount: number
        }[]
      }
      get_event_seating_availability: {
        Args: {
          p_event_id: string
        }
        Returns: {
          id: string
          tier_id: string
          sector_id: string
          sector_name: string
          layout_item_id: string
          label: string
          row_id: string | null
          row_number: number | null
          row_label: string | null
          color: string
          layout_type: "table_combo" | "numbered_seat"
          capacity_per_unit: number
          status: "available" | "reserved" | "sold" | "blocked"
          reserved_until: string | null
        }[]
      }
      scan_ticket_admission: {
        Args: {
          p_ticket_id: string
          p_validated_by: string
        }
        Returns: Json
      }
      configure_event_seating_tiers: {
        Args: {
          p_event_id: string
          p_configs: Json
        }
        Returns: undefined
      }
      expire_seating_orders: {
        Args: Record<string, never>
        Returns: number
      }
      get_event_service_charge_rate: {
        Args: {
          p_event_id: string
        }
        Returns: number
      }
      all_in_public_price: {
        Args: {
          p_base: number
          p_rate?: number
        }
        Returns: number
      }
      all_in_platform_fee: {
        Args: {
          p_base: number
          p_rate?: number
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
      create_complete_event_with_seating_tx: {
        Args: {
          payload: Json
          p_organizer_id: string
        }
        Returns: string
      }
      update_complete_event_tx: {
        Args: {
          p_event_id: string
          payload: Json
        }
        Returns: string
      }
      update_complete_event_with_seating_tx: {
        Args: {
          p_event_id: string
          payload: Json
        }
        Returns: string
      }
      get_organizer_metrics: {
        Args: {
          p_organizer_id: string
        }
        Returns: Json
      }
      get_organizer_governance_metrics: {
        Args: {
          p_organizer_id: string
        }
        Returns: Array<{
          total_events: number
          published_events: number
          tickets_sold: number
          historical_gmv: number
        }>
      }
      get_platform_global_metrics: {
        Args: Record<string, never>
        Returns: Array<{
          total_gmv: number
          platform_revenue: number
          total_tickets: number
          active_organizers: number
        }>
      }
      get_platform_organizations_summary: {
        Args: Record<string, never>
        Returns: Array<{
          organizer_id: string
          organizer_name: string
          organizer_email: string
          organizer_role: string
          approval_status: string
          service_charge_rate: number
          joined_at: string
          total_events: number
          published_events: number
          tickets_sold: number
          gross_revenue: number
        }>
      }
      update_organizer_governance_tx: {
        Args: {
          p_organizer_id: string
          p_actor_id: string
          p_status?: string | null
          p_service_charge_rate?: number | null
        }
        Returns: undefined
      }
      get_organizer_finance_summary: {
        Args: {
          p_organizer_id: string
        }
        Returns: Json
      }
      is_approved_organizer: {
        Args: {
          p_user_id?: string
        }
        Returns: boolean
      }
      release_reserved_tickets: {
        Args: {
          p_ticket_ids: string[]
        }
        Returns: undefined
      }
      activate_order_tickets: {
        Args: {
          p_order_id: string
        }
        Returns: number
      }
      finalize_paid_order: {
        Args: {
          p_order_id: string
          p_mp_payment_id: string
        }
        Returns: Json
      }
      cancel_paid_order_tickets: {
        Args: {
          p_order_id: string
        }
        Returns: number
      }
      is_ticket_admission_eligible: {
        Args: {
          p_ticket_id: string
        }
        Returns: boolean
      }
      expire_abandoned_order: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      expire_abandoned_orders: {
        Args: { p_older_than?: string }
        Returns: number
      }
      consume_rate_limit: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      user_has_event_staff_role: {
        Args: {
          p_event_id: string
          p_user_id: string
          p_role: EventStaffRole
        }
        Returns: boolean
      }
      user_is_event_organizer_or_staff: {
        Args: {
          p_event_id: string
          p_user_id: string
          p_roles?: EventStaffRole[] | null
        }
        Returns: boolean
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
          p_client_key?: string | null
        }
        Returns: string
      }
      check_in_guest: {
        Args: { p_ticket_id: string }
        Returns: undefined
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
      activate_paid_boost: {
        Args: {
          p_subscription_id: string
          p_payment_id: string
          p_featured_until: string
        }
        Returns: Json
      }
      request_organizer_settlement: {
        Args: {
          p_period_label?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      complete_organizer_settlement: {
        Args: { p_settlement_id: string }
        Returns: undefined
      }
      get_platform_orders_ledger: {
        Args: {
          p_organizer_id?: string | null
          p_event_id?: string | null
          p_status?: string | null
          p_limit?: number
        }
        Returns: {
          order_id: string
          created_at: string
          status: string
          payment_method: string
          mp_payment_id: string | null
          event_id: string | null
          event_title: string
          organizer_id: string | null
          organizer_name: string
          buyer_id: string
          buyer_name: string
          buyer_email: string
          gross_amount: number
          platform_fee_amount: number
          organizer_net_amount: number
          fee_rate: number
        }[]
      }
      get_platform_orders_ledger_totals: {
        Args: {
          p_organizer_id?: string | null
          p_event_id?: string | null
          p_status?: string | null
        }
        Returns: {
          gross: number
          platform_fee: number
          organizer_net: number
          order_count: number
          paid_count: number
        }[]
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
      organizer_approval_status: OrganizerApprovalStatus
      event_status: EventStatus
      ticket_status: TicketStatus
      zone_type: ZoneType
      seat_status: SeatStatus
      order_status: OrderStatus
    }
    CompositeTypes: Record<string, never>
  }
}
