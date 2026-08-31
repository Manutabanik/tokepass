import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components"

import {
  EMAIL_WALLET_CTA,
  LIVING_QR_EMAIL_DISCLAIMER,
} from "@/lib/email/receipt-copy"

export type OrderEmailTicket = {
  id: string
  label: string
}

export type OrderEmailProps = {
  customerName: string
  orderNumber: string
  eventName: string
  eventDate: string
  eventVenue: string
  eventBannerUrl?: string
  totalAmount: string
  tickets: OrderEmailTicket[]
  accountUrl?: string
}

const DEFAULT_ACCOUNT_URL = "https://www.tokepass.com.ar/cuenta/entradas"

export const PreviewProps: OrderEmailProps = {
  customerName: "Ana Perez",
  orderNumber: "TP-D5FF3977",
  eventName: "Noche en Club TokePass",
  eventDate: "Sabado 22 nov 2026 · 23:30",
  eventVenue: "CABA · Salón Central",
  eventBannerUrl: "https://www.tokepass.com.ar/brand/tokepass-mark.png",
  totalAmount: "$ 48.000",
  accountUrl: DEFAULT_ACCOUNT_URL,
  tickets: [
    { id: "tkt-demo-1", label: "Mesa 12 · Living" },
    { id: "tkt-demo-2", label: "General · Viernes" },
  ],
}

export function OrderConfirmationEmail({
  customerName,
  orderNumber,
  eventName,
  eventDate,
  eventVenue,
  eventBannerUrl,
  totalAmount,
  tickets,
  accountUrl = DEFAULT_ACCOUNT_URL,
}: OrderEmailProps) {
  const greeting = customerName.trim()
    ? `¡Hola, ${customerName.trim()}!`
    : "¡Hola!"
  const preview = `Recibo de tu compra para ${eventName}`

  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>TokePass</Text>
          <Text style={styles.kicker}>Recibo de compra</Text>
          <Text style={styles.title}>Tu compra de {eventName} está confirmada</Text>
          <Text style={styles.lead}>{greeting}</Text>
          <Text style={styles.lead}>
            Este mail es solo el comprobante. El acceso a la puerta está en tu
            billetera, con un código dinámico que no se puede reenviar ni
            imprimir.
          </Text>

          {eventBannerUrl ? (
            <Img
              src={eventBannerUrl}
              alt={eventName}
              width="504"
              style={styles.banner}
            />
          ) : null}

          <Section style={styles.card}>
            <Text style={styles.cardLabel}>Evento</Text>
            <Text style={styles.cardValue}>{eventName}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Fecha</Text>
            <Text style={styles.cardValue}>{eventDate}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Lugar</Text>
            <Text style={styles.cardValue}>{eventVenue}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Orden</Text>
            <Text style={styles.cardValue}>{orderNumber}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Total</Text>
            <Text style={styles.total}>{totalAmount}</Text>
          </Section>

          <Text style={styles.sectionTitle}>Detalle de entradas</Text>
          {tickets.map((ticket) => (
            <Section key={ticket.id} style={styles.ticketCard}>
              <Text style={styles.ticketLabel}>{ticket.label}</Text>
            </Section>
          ))}

          <Section style={styles.alert}>
            <Text style={styles.alertTitle}>Alerta de seguridad</Text>
            <Text style={styles.alertBody}>{LIVING_QR_EMAIL_DISCLAIMER}</Text>
          </Section>

          <Section style={styles.ctaWrap}>
            <Button href={accountUrl} style={styles.button}>
              {EMAIL_WALLET_CTA}
            </Button>
          </Section>

          <Hr style={styles.footerRule} />
          <Text style={styles.footer}>
            ¿Tuviste algún problema con tu compra? Respondé a este mail o
            escribinos por WhatsApp.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

OrderConfirmationEmail.PreviewProps = PreviewProps

const styles = {
  body: {
    backgroundColor: "#0B0F17",
    fontFamily:
      'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    margin: 0,
    padding: "32px 12px",
  },
  container: {
    backgroundColor: "#0B0F17",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "8px 12px 28px",
  },
  brand: {
    color: "#E5E7EB",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.22em",
    margin: "0 0 18px",
    textTransform: "uppercase" as const,
  },
  kicker: {
    color: "#10B981",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    margin: "0 0 8px",
    textTransform: "uppercase" as const,
  },
  title: {
    color: "#F9FAFB",
    fontSize: "26px",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    lineHeight: "1.25",
    margin: "0 0 10px",
  },
  lead: {
    color: "#9CA3AF",
    fontSize: "15px",
    lineHeight: "1.55",
    margin: "0 0 20px",
  },
  banner: {
    borderRadius: "16px",
    display: "block",
    height: "auto",
    margin: "0 0 20px",
    maxWidth: "100%",
    objectFit: "cover" as const,
    width: "100%",
  },
  card: {
    backgroundColor: "#1F2937",
    border: "1px solid #374151",
    borderRadius: "16px",
    padding: "8px 20px 16px",
  },
  cardLabel: {
    color: "#9CA3AF",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    margin: "12px 0 4px",
    textTransform: "uppercase" as const,
  },
  cardValue: {
    color: "#F9FAFB",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "1.45",
    margin: "0",
  },
  total: {
    color: "#10B981",
    fontSize: "20px",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    margin: "0",
  },
  divider: {
    borderColor: "#374151",
    borderTop: "1px solid #374151",
    margin: "12px 0 0",
  },
  sectionTitle: {
    color: "#F9FAFB",
    fontSize: "16px",
    fontWeight: 800,
    margin: "28px 0 12px",
  },
  ticketCard: {
    backgroundColor: "#1F2937",
    border: "1px solid #374151",
    borderRadius: "16px",
    marginBottom: "10px",
    padding: "14px 16px",
  },
  ticketLabel: {
    color: "#E5E7EB",
    fontSize: "14px",
    fontWeight: 700,
    margin: "0",
  },
  alert: {
    backgroundColor: "#3F1D1D",
    border: "1px solid #7F1D1D",
    borderRadius: "16px",
    margin: "24px 0 8px",
    padding: "16px 18px",
  },
  alertTitle: {
    color: "#FECACA",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.16em",
    margin: "0 0 8px",
    textTransform: "uppercase" as const,
  },
  alertBody: {
    color: "#F3F4F6",
    fontSize: "13px",
    lineHeight: "1.55",
    margin: "0",
  },
  ctaWrap: {
    margin: "28px 0 16px",
    textAlign: "center" as const,
  },
  button: {
    backgroundColor: "#10B981",
    borderRadius: "12px",
    color: "#FFFFFF",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: 800,
    padding: "16px 32px",
    textDecoration: "none",
  },
  footerRule: {
    borderColor: "#374151",
    margin: "24px 0 12px",
  },
  footer: {
    color: "#6B7280",
    fontSize: "11px",
    margin: "0",
  },
} as const
