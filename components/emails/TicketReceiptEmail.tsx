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

export type TicketReceiptEmailProps = {
  buyerName?: string
  eventTitle: string
  eventDateLabel: string
  eventLocation: string
  ticketCount: number
  totalPaidLabel: string
  walletUrl: string
  logoUrl: string
  otpCode?: string
}

export function TicketReceiptEmail({
  buyerName,
  eventTitle,
  eventDateLabel,
  eventLocation,
  ticketCount,
  totalPaidLabel,
  walletUrl,
  logoUrl,
  otpCode,
}: TicketReceiptEmailProps) {
  const greeting = buyerName?.trim()
    ? `¡Hola, ${buyerName.trim()}!`
    : "¡Hola!"
  const ticketLabel =
    ticketCount === 1 ? "1 entrada" : `${ticketCount} entradas`
  const preview = `¡Acá están tus entradas para ${eventTitle}!`

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

          <Text style={styles.kicker}>Pago confirmado</Text>
          <Text style={styles.title}>
            ¡Acá están tus entradas para {eventTitle}!
          </Text>
          <Text style={styles.lead}>{greeting}</Text>
          <Text style={styles.lead}>
            ¡Todo listo! Tu compra quedó confirmada. Podés ver tus códigos de
            acceso directamente desde el botón de abajo o ingresando a la app.
          </Text>

          <Section style={styles.card}>
            <Text style={styles.cardLabel}>Evento</Text>
            <Text style={styles.cardValue}>{eventTitle}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Fecha</Text>
            <Text style={styles.cardValue}>{eventDateLabel}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Lugar</Text>
            <Text style={styles.cardValue}>{eventLocation}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Entradas</Text>
            <Text style={styles.cardValue}>{ticketLabel}</Text>
            <Hr style={styles.divider} />
            <Text style={styles.cardLabel}>Total pagado</Text>
            <Text style={styles.total}>{totalPaidLabel}</Text>
          </Section>

          <Section style={styles.ctaWrap}>
            <Button href={walletUrl} style={styles.button}>
              Ver mis entradas en TokePass
            </Button>
          </Section>

          {otpCode ? (
            <Text style={styles.security}>
              Tu codigo de acceso es {otpCode}. Lo vas a necesitar para ver el QR
              en un dispositivo nuevo.
            </Text>
          ) : null}

          <Text style={styles.security}>
            Por motivos de seguridad y para evitar fraudes, tus códigos QR son
            dinámicos y solo pueden visualizarse desde la plataforma. No se
            adjuntan PDFs.
          </Text>

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
  ctaWrap: {
    margin: "28px 0 20px",
    textAlign: "center" as const,
  },
  button: {
    backgroundColor: "#059669",
    borderRadius: "999px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 700,
    padding: "14px 28px",
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
