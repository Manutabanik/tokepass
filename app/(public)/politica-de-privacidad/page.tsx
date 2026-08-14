import type { Metadata } from "next"

import {
  LegalDocument,
  LegalSection,
} from "@/components/legal/legal-document"
import { LEGAL_ENTITY_CUIT, LEGAL_ENTITY_NAME } from "@/lib/legal/site"

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Cómo Tokepass trata datos personales de compradores y organizadores.",
}

export default function PoliticaDePrivacidadPage() {
  return (
    <LegalDocument
      title="Política de privacidad"
      lead="Texto placeholder alineado a la Ley 25.326. Completá el domicilio de la SRL, el correo de privacidad y los encargados de tratamiento reales (pasarela de pagos, hosting, correo) antes de publicar."
    >
      <p className="text-xs text-muted-foreground">
        Última actualización: 14 de agosto de 2026.
      </p>

      <LegalSection title="1. Información de la Empresa (SRL)">
        <p>
          El responsable del tratamiento es{" "}
          <strong className="font-semibold text-foreground">
            {LEGAL_ENTITY_NAME}
          </strong>
          , CUIT {LEGAL_ENTITY_CUIT}, domicilio [completar], correo de
          contacto [privacidad@tokepass.com.ar]. Tokepass opera una plataforma
          de boletería digital en la República Argentina.
        </p>
      </LegalSection>

      <LegalSection title="2. Uso del Servicio y datos que recabamos">
        <p>
          Tratamos datos necesarios para crear la cuenta, emitir entradas,
          identificar al titular (nombre, DNI, correo, teléfono), procesar
          pagos, prevenir fraude y brindar soporte. También podemos registrar
          identificadores técnicos (sesión, dispositivo, dirección IP) y
          métricas de uso del sitio.
        </p>
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec
          vehicula, sapien sit amet tristique tincidunt, nisl nisl aliquet
          nisl, vitae tincidunt nisl nisl sit amet nisl. No solicitamos datos
          sensibles salvo que una funcionalidad concreta lo exija y el usuario
          lo consienta.
        </p>
      </LegalSection>

      <LegalSection title="3. Políticas de Devolución y conservación">
        <p>
          Conservamos comprobantes y datos de la orden el tiempo exigido por
          normas fiscales, de defensa del consumidor y de prevención de fraude.
          Las solicitudes de arrepentimiento o reembolso pueden implicar
          comunicar datos al procesador de pagos y al organizador del evento
          para ejecutar la cancelación.
        </p>
      </LegalSection>

      <LegalSection title="4. Encargados y transferencias">
        <p>
          Proveedores típicos (a confirmar): hosting e infraestructura,
          correo transaccional, analítica, y la pasarela de pagos (por ejemplo
          Mercado Pago). Cada encargado trata datos según su propio aviso y
          los contratos de encargo. No vendemos bases de datos de compradores.
        </p>
      </LegalSection>

      <LegalSection title="5. Derechos del titular">
        <p>
          Podés acceder, rectificar, actualizar o suprimir tus datos, y
          oponerte a tratamientos no obligatorios, en los términos de la Ley
          25.326 y la normativa de la Agencia de Acceso a la Información
          Pública. El canal de ejercicio es [correo de privacidad].
        </p>
        <p>
          La Dirección Nacional de Protección de Datos Personales, Autoridad
          de Control de la Ley 25.326, tiene la atribución de atender
          denuncias y reclamos.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies y comunicaciones">
        <p>
          Usamos cookies técnicas imprescindibles para la sesión y, en su
          caso, cookies de medición o marketing con la base jurídica que
          corresponda. Podés limitar cookies no esenciales desde el
          navegador. Enviaremos correos operativos (entrada, pago, transferencias).
          Los mensajes promocionales se podrán desuscribir cuando existan.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
