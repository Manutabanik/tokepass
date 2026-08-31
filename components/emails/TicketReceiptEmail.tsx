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

export type TicketReceiptLine = {
  id: string
  label: string
}

export type TicketReceiptEmailProps = {
  buyerName?: string
  eventTitle: string
  eventDateLabel: string
  eventLocation: string
  orderNumber?: string
  ticketCount: number
  tickets?: TicketReceiptLine[]
  totalPaidLabel: string
  walletUrl: string
  logoUrl: string
  eventBannerUrl?: string
  otpCode?: string
}

export function TicketReceiptEmail({
  buyerName,
  eventTitle,
  eventDateLabel,
  eventLocation,
  orderNumber,
  ticketCount,
  tickets = [],
  totalPaidLabel,
  walletUrl,
  logoUrl,
  eventBannerUrl,
  otpCode,
}: TicketReceiptEmailProps) {
  const greeting = buyerName?.trim()
    ? `¡Hola, ${buyerName.trim()}!`
    : "¡Hola!"
  const ticketLabel =
    ticketCount === 1 ? "1 entrada" : `${ticketCount} entradas`
  const preview = `Recibo de tu compra para ${eventTitle}`

  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Img
              src={logoUrl}
              width="40"
              height="40"
              alt="TokePass"
              style={styles.logo}
            />
            <Text style={styles.brand}>TokePass</Text>
          </Section>

          <Text style={styles.kicker}>Recibo de compra</Text>
          <Text style={styles.title}>
            Tu compra de {eventTitle} está confirmada
          </Text>
          <Text style={styles.lead}>{greeting}</Text>
          <Text style={styles.lead}>
            Este mail es solo el comprobante. El acceso a la puerta está en tu
            billetera.
          </Text>

          {eventBannerUrl ? (
            <Img
              src={eventBannerUrl}
              alt={eventTitle}
              width="504"
              style={styles.banner}
            />
          ) : null}

          <Section style={styles.card}>
            <Text style={styles.cardLabel}>Evento</Text>
            <Text style={styles.cardValue}>{eventTitle}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Fecha</Text>
            <Text style={styles.cardValue}>{eventDateLabel}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Lugar</Text>
            <Text style={styles.cardValue}>{eventLocation}</Text>
            {orderNumber ? (
              <>
                <Hr style={styles.divider} />
                <Text style={styles.cardLabel}>Orden</Text>
                <Text style={styles.cardValue}>{orderNumber}</Text>
              </>
            ) : null}
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Entradas</Text>
            <Text style={styles.cardValue}>{ticketLabel}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Total pagado</Text>
            <Text style={styles.total}>{totalPaidLabel}</Text>
          </Section>

          {tickets.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Detalle de entradas</Text>
              {tickets.map((ticket) => (
                <Section key={ticket.id} style={styles.ticketCard}>
                  <Text style={styles.ticketLabel}>{ticket.label}</Text>
                </Section>
              ))}
            </>
          ) : null}

          <Section style={styles.alert}>
            <Text style={styles.alertTitle}>Alerta de seguridad</Text>
            <Text style={styles.alertBody}>{LIVING_QR_EMAIL_DISCLAIMER}</Text>
          </Section>

          <Section style={styles.ctaWrap}>
            <Button href={walletUrl} style={styles.button}>
              {EMAIL_WALLET_CTA}
            </Button>
          </Section>

          {otpCode ? (
            <Text style={styles.security}>
              Si compraste como invitado, tu código de verificación es {otpCode}.
            </Text>
          ) : null}

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

const styles = {
  body: {
    backgroundColor: "#09090b",
    fontFamily:
      'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    margin: 0,
    padding: "32px 12px",
  },
  container: {
    backgroundColor: "#121216",
    border: "1px solid #27272a",
    borderRadius: "20px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px 28px 28px",
  },
  header: {
    marginBottom: "24px",
  },
  logo: {
    borderRadius: "10px",
    display: "block",
  },
  brand: {
    color: "#e4e4e7",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.18em",
    margin: "10px 0 0",
    textTransform: "uppercase" as const,
  },
  kicker: {
    color: "#34d399",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.2em",
    margin: "0 0 10px",
    textTransform: "uppercase" as const,
  },
  title: {
    color: "#fafafa",
    fontSize: "24px",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    lineHeight: "1.25",
    margin: "0 0 12px",
  },
  lead: {
    color: "#a1a1aa",
    fontSize: "15px",
    lineHeight: "1.55",
    margin: "0 0 24px",
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
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "16px",
    padding: "8px 20px 16px",
  },
  cardLabel: {
    color: "#71717a",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    margin: "12px 0 4px",
    textTransform: "uppercase" as const,
  },
  cardValue: {
    color: "#f4f4f5",
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "1.45",
    margin: "0",
  },
  total: {
    color: "#34d399",
    fontSize: "20px",
    fontWeight: 800,
    letterSpacing: "-0.03em",
    margin: "0",
  },
  divider: {
    borderColor: "#27272a",
    borderTop: "1px solid #27272a",
    margin: "12px 0 0",
  },
  sectionTitle: {
    color: "#fafafa",
    fontSize: "15px",
    fontWeight: 800,
    margin: "24px 0 10px",
  },
  ticketCard: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "14px",
    marginBottom: "8px",
    padding: "12px 14px",
  },
  ticketLabel: {
    color: "#e4e4e7",
    fontSize: "14px",
    fontWeight: 700,
    margin: "0",
  },
  alert: {
    backgroundColor: "#3f1d1d",
    border: "1px solid #7f1d1d",
    borderRadius: "16px",
    margin: "24px 0 8px",
    padding: "16px 18px",
  },
  alertTitle: {
    color: "#fecaca",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.16em",
    margin: "0 0 8px",
    textTransform: "uppercase" as const,
  },
  alertBody: {
    color: "#f4f4f5",
    fontSize: "13px",
    lineHeight: "1.55",
    margin: "0",
  },
  ctaWrap: {
    margin: "28px 0 20px",
    textAlign: "center" as const,
  },
  button: {
    backgroundColor: "#059669",
    borderRadius: "12px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "16px",
    fontWeight: 800,
    padding: "16px 32px",
    textDecoration: "none",
  },
  security: {
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "1.55",
    margin: "0",
  },
  footerRule: {
    borderColor: "#27272a",
    margin: "24px 0 12px",
  },
  footer: {
    color: "#52525b",
    fontSize: "11px",
    margin: "0",
  },
} as const
