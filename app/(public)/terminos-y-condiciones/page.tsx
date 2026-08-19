import type { Metadata } from "next"

import {
  LegalDocument,
  LegalSection,
} from "@/components/legal/legal-document"
import {
  LEGAL_ENTITY_ADDRESS,
  LEGAL_ENTITY_LEGAJO,
  LEGAL_ENTITY_NAME,
} from "@/lib/legal/site"

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Condiciones de uso de la plataforma de boletería digital TokePass.",
}

export default function TerminosYCondicionesPage() {
  return (
    <LegalDocument
      title="Términos y condiciones"
      lead="El presente documento establece los Términos y Condiciones que rigen el uso de la plataforma TokePass y la compra de entradas a través de la misma."
    >
      <p className="text-xs text-muted-foreground">
        Última actualización: 18 de agosto de 2026.
      </p>

      <LegalSection title="1. Información legal y aceptación">
        <p>
          La Plataforma es operada por{" "}
          <strong className="font-semibold text-foreground">
            {LEGAL_ENTITY_NAME}
          </strong>
          , sociedad constituida y registrada bajo el Legajo N°{" "}
          {LEGAL_ENTITY_LEGAJO} del Registro Público de Comercio del Poder
          Judicial de San Juan, con domicilio en {LEGAL_ENTITY_ADDRESS}. Al
          tildar la casilla de aceptación durante la compra, el usuario declara
          haber leído, comprendido y aceptado la totalidad de este documento.
        </p>
      </LegalSection>

      <LegalSection title="2. Naturaleza del servicio">
        <p>
          {LEGAL_ENTITY_NAME}, a través de TokePass, actúa exclusivamente como
          intermediario tecnológico para la comercialización de entradas y
          provisión de software. TokePass NO es el organizador, productor ni
          promotor de los eventos. La responsabilidad integral sobre el evento
          recae única y exclusivamente sobre el Organizador del mismo.
        </p>
      </LegalSection>

      <LegalSection title="3. Política de compra y emisión">
        <p>
          Las entradas son nominativas, personales e intransferibles, salvo
          habilitación expresa del Organizador. El código QR es de un único
          uso. TokePass y el Organizador no se responsabilizan por la copia o
          uso indebido del código QR por negligencia del Comprador.
        </p>
      </LegalSection>

      <LegalSection title="4. Política de cancelaciones, devoluciones y contracargos">
        <p>
          El comprador tiene derecho a revocar la aceptación de la compra
          dentro de los 10 días computados a partir de la celebración del
          contrato, conforme a las normativas de Defensa del Consumidor
          aplicables en la República Argentina. El derecho se ejerce desde
          el Botón de Arrepentimiento de TokePass, siempre que falten al
          menos 24 horas para el inicio del evento.
        </p>
        <p>
          Cancelación del Evento: En caso de cancelación o reprogramación, el
          Organizador es el único responsable de procesar reembolsos. El cargo
          por servicio (Service Charge) de TokePass NO será reembolsable bajo
          ninguna circunstancia, ya que corresponde al servicio tecnológico
          efectivamente prestado.
        </p>
        <p>
          Fraude y Contracargos: El Comprador acepta que su aceptación digital
          de estos Términos constituye prueba fehaciente de la compra. Cualquier
          desconocimiento de compra (contracargo) fraudulento facultará a{" "}
          {LEGAL_ENTITY_NAME} a cancelar las entradas, bloquear la cuenta e
          iniciar acciones legales.
        </p>
      </LegalSection>

      <LegalSection title="5. Derecho de admisión y propiedad intelectual">
        <p>
          El Organizador se reserva el exclusivo derecho de admisión. El
          software, diseño y código fuente de la Plataforma son propiedad de{" "}
          {LEGAL_ENTITY_NAME}, prohibiéndose su copia o reproducción.
        </p>
      </LegalSection>

      <LegalSection title="6. Jurisdicción">
        <p>
          Las partes se someten voluntariamente a la jurisdicción de los
          Tribunales Ordinarios de la Provincia de San Juan, República
          Argentina.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
