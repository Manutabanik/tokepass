import type { Metadata } from "next"

import {
  LegalDocument,
  LegalSection,
} from "@/components/legal/legal-document"
import {
  LEGAL_ENTITY_ADDRESS,
  LEGAL_ENTITY_LEGAJO,
  LEGAL_ENTITY_NAME,
  TURNSTILE_PRIVACY_HREF,
} from "@/lib/legal/site"

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo TokePass trata datos personales de compradores y organizadores.",
}

export default function PoliticaDePrivacidadPage() {
  return (
    <LegalDocument
      title="Política de privacidad"
      lead="Política de privacidad y datos personales de TokePass, en cumplimiento de la Ley N° 25.326 de Protección de Datos Personales de la República Argentina."
    >
      <p className="text-xs text-muted-foreground">
        Última actualización: 19 de agosto de 2026.
      </p>

      <LegalSection title="1. Responsable de los datos">
        <p>
          <strong className="font-semibold text-foreground">
            {LEGAL_ENTITY_NAME}
          </strong>{" "}
          (Legajo N° {LEGAL_ENTITY_LEGAJO}, {LEGAL_ENTITY_ADDRESS}) es
          responsable del tratamiento de los datos personales recabados a
          través de TokePass, en estricto cumplimiento de la Ley N° 25.326 de
          Protección de Datos Personales de la República Argentina.
        </p>
      </LegalSection>

      <LegalSection title="2. Datos recopilados y seguridad financiera">
        <p>
          Recopilamos: nombre completo, documento de identidad, correo
          electrónico y teléfono. TokePass NO almacena, procesa ni retiene
          números de tarjetas de crédito o códigos de seguridad (CVV). Todo
          procesamiento de pagos se realiza a través de pasarelas externas
          certificadas bajo normativas PCI-DSS (ej. Mercado Pago).
        </p>
      </LegalSection>

      <LegalSection title="3. Finalidad del tratamiento">
        <p>
          Los datos se utilizarán exclusivamente para: procesar la compra y
          emitir los accesos, prevenir fraude o contracargos, y compartir la
          lista de asistentes con el Organizador del evento a los únicos fines
          de validación y control de acceso en puerta.
        </p>
      </LegalSection>

      <LegalSection title="4. Derechos del titular">
        <p>
          {LEGAL_ENTITY_NAME} adopta medidas técnicas para garantizar la
          confidencialidad de los datos. El Usuario tiene derecho a solicitar
          el acceso, rectificación o supresión de sus datos comunicándose a
          través de los canales oficiales de soporte de la plataforma. La
          Agencia de Acceso a la Información Pública es el órgano de control de
          la Ley N° 25.326.
        </p>
      </LegalSection>

      <LegalSection title="5. Cloudflare Turnstile y otros encargados">
        <p>
          En el checkout usamos Cloudflare Turnstile en modo invisible para
          distinguir personas de bots y prevenir compras automáticas. Cloudflare
          puede tratar datos técnicos del dispositivo y de la conexión (por
          ejemplo dirección IP y señales del navegador) según su propio anexo.
          Ese tratamiento se rige por el{" "}
          <a
            href={TURNSTILE_PRIVACY_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Anexo de Privacidad de Turnstile de Cloudflare
          </a>
          .
        </p>
        <p>
          El cobro de entradas lo procesa Mercado Pago u otra pasarela
          certificada. TokePass no guarda números de tarjeta ni códigos CVV.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
