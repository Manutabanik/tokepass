import type { Metadata } from "next"
import Link from "next/link"

import {
  LegalDocument,
  LegalSection,
} from "@/components/legal/legal-document"
import {
  LEGAL_ENTITY_CUIT,
  LEGAL_ENTITY_NAME,
  LEGAL_JURISDICTION,
} from "@/lib/legal/site"

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Condiciones de uso de la plataforma de boletería digital Tokepass.",
}

export default function TerminosYCondicionesPage() {
  return (
    <LegalDocument
      title="Términos y condiciones"
      lead="Texto placeholder para revisión legal. Sustituí los campos entre corchetes por los datos de la SRL, el domicilio y las políticas definitivas antes de publicar en producción."
    >
      <p className="text-xs text-muted-foreground">
        Última actualización: 14 de agosto de 2026.
      </p>

      <LegalSection title="1. Información de la Empresa (SRL)">
        <p>
          El sitio y la aplicación Tokepass son operados por{" "}
          <strong className="font-semibold text-foreground">
            {LEGAL_ENTITY_NAME}
          </strong>
          , sociedad de responsabilidad limitada constituida en la{" "}
          {LEGAL_JURISDICTION}, CUIT {LEGAL_ENTITY_CUIT}, con domicilio legal en
          [calle, número, localidad, provincia]. En estos términos, “Tokepass”,
          “nosotros” o “la plataforma” se refieren a dicha sociedad.
        </p>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer
          posuere, nisl vitae tincidunt fermentum, sapien sapien tincidunt
          sapien, vitae dictum odio lorem non erat. El objeto social incluye la
          intermediación en la comercialización de entradas y servicios
          conexos para eventos.
        </p>
      </LegalSection>

      <LegalSection title="2. Uso del Servicio">
        <p>
          Tokepass permite descubrir eventos, reservar cupo y pagar entradas
          digitales u otros productos habilitados por el organizador. El usuario
          declara ser mayor de 18 años o contar con autorización de quien
          ejerza la responsabilidad parental.
        </p>
        <p>
          Vestibulum ante ipsum primis in faucibus orci luctus et ultrices
          posuere cubilia curae. Queda prohibido el uso de la plataforma para
          fraude, reventa no autorizada fuera de los canales oficiales, o
          cualquier conducta que vulnere derechos de terceros o la normativa
          aplicable.
        </p>
        <p>
          El organizador es responsable del evento (fecha, lugar, elenco y
          condiciones de acceso). Tokepass actúa como intermediario tecnológico
          y de cobro, salvo que se indique lo contrario en la ficha del evento.
        </p>
      </LegalSection>

      <LegalSection title="3. Políticas de Devolución">
        <p>
          Las entradas son un bien de esparcimiento. Las cancelaciones y
          reembolsos se rigen por (a) la política publicada por el organizador
          en el evento, (b) la normativa de defensa del consumidor de la
          República Argentina, y (c)           el{" "}
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href="/arrepentimiento"
          >
            Botón de Arrepentimiento
          </Link>{" "}
          cuando corresponda.
        </p>
        <p>
          Suspendisse potenti. Nullam at ligula sit amet nisl rhoncus
          tincidunt. Si el evento se reprograma o cancela, el organizador debe
          informar la alternativa (nueva fecha, crédito o reintegro). Los plazos
          de acreditación del reembolso dependen del medio de pago utilizado
          (por ejemplo, Mercado Pago).
        </p>
      </LegalSection>

      <LegalSection title="4. Pagos, precios y cargos">
        <p>
          Los importes se exhiben en pesos argentinos (ARS), con el precio
          final informado antes de confirmar la compra. El checkout puede
          redirigir a un procesador de pagos de terceros. Tokepass no almacena
          los datos completos de tarjetas.
        </p>
      </LegalSection>

      <LegalSection title="5. Propiedad intelectual">
        <p>
          Marcas, tipografías, software y contenidos de Tokepass pertenecen a{" "}
          {LEGAL_ENTITY_NAME} o a sus licenciantes. Los flyers y materiales del
          evento pertenecen al organizador. Queda vedada su reproducción no
          autorizada.
        </p>
      </LegalSection>

      <LegalSection title="6. Limitación de responsabilidad">
        <p>
          En la máxima medida permitida por la ley argentina, Tokepass no
          responde por incumplimientos del organizador, fallas de conectividad
          del usuario ni caso fortuito o fuerza mayor. Esta cláusula no limita
          derechos irrenunciables del consumidor.
        </p>
      </LegalSection>

      <LegalSection title="7. Ley aplicable y jurisdicción">
        <p>
          Estos términos se rigen por las leyes de la {LEGAL_JURISDICTION}.
          Para controversias de consumo se aplican los foros y procedimientos
          previstos en la Ley 24.240 y normas complementarias. Fuera de ese
          ámbito, [juzgados ordinarios de la Ciudad Autónoma de Buenos Aires /
          domicilio de la SRL].
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
