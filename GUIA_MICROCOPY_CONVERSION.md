# Guía de microcopy y conversión B2C — TokePass

**Fecha:** 21 de agosto de 2026  
**Alcance:** solo lectura del flujo de compra (ficha → selector → extras → datos → pago → post-compra).  
**No se modificó código.** Este documento es la especificación de textos.

**Voz de marca:** rioplatense, segunda persona (“tú/vos” consistente en *vos*), concreta, sin jerga interna. Prometer solo lo que el sistema hace (Living QR, All-In, WhatsApp).

**Principio:** cada pantalla responde tres preguntas — *qué compro*, *cuánto pago*, *qué pasa después*. Si un string no responde una, sobra o falta.

---

## 0. Hallazgos transversales (antes de las pantallas)

| Problema | Dónde pega | Impacto |
| --- | --- | --- |
| CTA mobile ONLINE dice **“Acceder”** y el desktop dice **“Adquirir Entradas”** | Ficha | “Acceder” suena a “ya pagué / entrar al Zoom”. Abandono o clic frustrado. |
| CTA del túnel usa **“lugar/lugares”** para entradas generales | Selector | Quien no eligió butaca cree que le van a asignar asiento. |
| Drawer del carrito hardcodea **“Continuar a pago”** en todos los pasos | `checkout-floating-bar.tsx` | En extras/datos miente: el usuario no va al cobro todavía. |
| Datos del comprador: **no hay helper bajo Email ni DNI** | Buyer | Fricción + desconfianza (¿para spam? ¿para AFIP?). |
| Post-compra **siempre** habla de WhatsApp + Living QR | Success | En ONLINE es falso o irrelevante; genera tickets al soporte. |
| Jerga **All-In**, **Living QR**, **Garantía TokePass** sin una línea de traducción | Pago / wallet | Quien compra por primera vez no sabe qué está aceptando. |
| Ortografía inconsistente (`Ya estas`, `Tambien`, `expiro`) | Success / errores | Baja percepción de producto “enterprise”. |

---

## 1. Ficha del evento

### 1.1 Hero / estado comercial

**Ubicación:** `components/public/event-storefront.tsx`

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Badge fin | `Finalizado` | `Evento finalizado` | Evita ambigüedad “¿el show o la venta?”. |
| Badge stock | `Agotado` | `Entradas agotadas` | Nombrar el objeto reduce “¿agotó el evento o mi tarifa?”. |
| Urgencia catálogo | `Últimas entradas` (`lib/discovery-filters.ts`) | `Quedan pocas` (ficha) / mantener `Últimas entradas` en home | En ficha, “quedan pocas” empuja a elegir tarifa, no a huir. |
| Borrador | `Borrador` | No mostrar a comprador, o `Próximamente` | Copy interno de B2B en B2C mata conversión. |

### 1.2 Modalidad presencial vs online

**Ubicación:** `event-storefront.tsx` (accordion “Información útil” **490–524**), `lib/events/delivery-mode.ts` **25–27**, buy box **298–306**.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Label horario ONLINE | `Inicio de transmisión` | `Empieza a las {hora}` + chip `Online · desde casa` | “Transmisión” es técnico; “desde casa” ancla el beneficio. |
| Label horario presencial | `Puertas` | `Apertura de puertas {hora}` | “Puertas” solo es jerga de venue. |
| Edad ONLINE | *Verificá la política… el anfitrión puede pedir DNI.* | `Si el evento es +18, el organizador puede pedirte DNI al entrar al link. TokePass no controla la sala virtual.` | Misma honestidad que presencial, en una línea. |
| Edad presencial | *…TokePass no garantiza el ingreso…* (**502**) | Conservar. Es el mejor copy legal del flujo. | Reduce chargebacks “me rechazaron en puerta”. |
| Qué llevar ONLINE | *El link aparece en Mis entradas…* (**511**) | `Después de pagar, el link queda en Mis entradas. No hay QR ni fila.` | Cierra la objeción “¿y el código?”. |
| Qué llevar presencial | *Llevá tu Living QR…* (**512**) | `Llevá el celular con batería. En puerta mostrás el Living QR (el código cambia solo; no sirve una captura).` | Traduce la marca en la misma frase. |
| Devoluciones | *Las devoluciones dependen…* (**520–522**) | `Si el organizador cancela, te devolvemos. Si vos no podés ir, aplica la política del evento (abajo o en Términos).` | Separa “culpa del organizer” vs “cambio de planes”. Hoy suena evasivo. |

**Falta (no existe hoy):** un chip visible *arriba del fold* `Presencial · {venue}` o `Online · link post-compra`. El usuario solo lo infiere por el mapa ausente.

### 1.3 Selector de días (multidía)

**Ubicación:** `components/public/event-date-selector.tsx` **24–48** (solo `aria-label="Elegí la fecha"`, chips `weekday` + `dayMonth`). En checkout: `event-checkout-selector.tsx` **“Tickets por Día” / “Combos y Promos”** y `Mismo valor para cualquier día seleccionado`.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Heading (faltante en ficha) | *(ninguno visible)* | `¿Qué día vas?` | Sin título, los chips parecen filtro de lineup, no de compra. |
| Helper (faltante) | — | `Elegí el día ahora. Las entradas de cada jornada se venden por separado.` | Evita comprar el viernes creyendo que entra el sábado. |
| Helper mismo precio | `Mismo valor para cualquier día seleccionado` | `Mismo precio todos los días. Elegí el que vas a ir.` | “Valor” es B2B; “el que vas a ir” reduce error de día. |
| Tabs checkout | `Tickets por Día` / `Combos y Promos` | `Por día` / `Abono o combo` | Más corto, menos “backoffice”. |
| Chip de fecha checkout | weekday + número | Mantener visual; `aria-label` ya usa `date.label` (bien). | — |

### 1.4 CTA principal

**Ubicación:**  
- Desktop: `event-storefront-buy-box.tsx` **83** (`Adquirir Entradas` fijo).  
- Mobile dock: `event-storefront.tsx` **769** + `floating-checkout-dock.tsx` **17, 40–52**.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Precio | `Entradas desde` / `Desde` | `Desde` (ambos) | Una sola palabra; el dock ya está corto. |
| Sin precio | `Consultar` | `Ver entradas` | “Consultar” parece WhatsApp/soporte, no checkout. |
| Badge stock | `Venta activa` / `Disponibilidad limitada` | `Hay entradas` / `Quedan pocas` | “Venta activa” no vende; es estado interno. |
| CTA presencial | `Adquirir Entradas` | `Elegir entradas` | “Adquirir” es formal y suena a trámite. “Elegir” es el siguiente paso real (aún no paga). |
| CTA ONLINE mobile | `Acceder` | `Elegir acceso` o `Comprar acceso online` | **Crítico.** “Acceder” = entrar al stream. El usuario cree que el botón es el link. |
| CTA ONLINE desktop | `Adquirir Entradas` (no distingue) | Mismo que mobile: `Elegir acceso` | Alinear ambas superficies. |
| Confianza buy box | `Compra 100% segura y encriptada` | `Pago seguro. Tu entrada queda a tu nombre.` | “Encriptada” no convierte en AR; nominación sí (anti-reventa trucha). |
| Garantía | `Garantía TokePass: Entrada nominada…` | Ver §5. En ONLINE: variante sin “puerta”. | El sello actual asume predio. |

---

## 2. Selector de entradas

**Ubicación:** `event-checkout-selector.tsx`, `ticket-tier-list.tsx`, `CheckoutTunnel.tsx` (título/CTA).

### 2.1 Títulos y navegación

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| H2 | `Elegí tu entrada` (**2541**, **568**) | Conservar | Es el mejor H2 del flujo. |
| H3 | `Seleccioná tus entradas` | Quitar o `Tarifas` | Duplica el H2; ocupa aire. |
| Vacío | `No hay entradas para esta selección.` | `No hay entradas para este día. Probá otro o un abono.` | Da la siguiente acción. |
| Sin tarifas | `Este evento todavía no tiene tipos de entrada configurados.` | `Las entradas todavía no están a la venta.` | No exponer “tipos configurados” (jerga admin). |
| Inclusión mapa | `Las entradas seleccionadas se reservan de forma temporal durante el proceso de pago.` | `Reservamos tu lugar 10 minutos mientras pagás.` | Número concreto baja ansiedad. |
| Asientos | `Elegir lugar` / `Modificar` | `Elegir asiento` / `Cambiar asiento` | “Lugar” es vago (¿sector? ¿día?). |
| Asientos sintéticos | `Asientos numerados` + `Elegí mesas o butacas en el plano` | Conservar el helper; título `Elegí tu asiento` | Más verbo, menos inventario. |

### 2.2 Tarifas, badges y escasez

**Ubicación:** `ticket-tier-list.tsx`, `event-checkout-selector.tsx` (`StockHint`, badges).

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Escasez | `Pocas disponibles` | `Quedan {n}` si `n ≤ 12`; si no, `Pocas` | El número es el copy de urgencia más fuerte (Cialdini / stock). Ya existe `remaining` en `stock-scarcity.ts`. |
| Agotado | `Agotado` | Conservar | Universal en AR. |
| Highlight | `Más vendida` | Conservar | Prueba social sin inventar “best seller”. |
| Acceso | `Incluye acceso` | `Incluye entrada general` | “Acceso” suena a VIP/fila. |
| Custom badge | `badgeText` del organizer | Guía B2B: máx. 22 caracteres, beneficio (*Fast pass*, *+1 trago*), no claim vacío | Evitar “INCREÍBLE” que no convierte. |
| Combos | `En el carrito` / `Agregar` | `Agregado` / `Agregar combo` | Simetría con extras. |
| Ahorro combo | `Ahorrás $X` | Conservar | Mejor copy de precio del producto. |

### 2.3 CTA del paso

**Ubicación:** `CheckoutTunnel.tsx` **2548–2554**.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Con selección | `Continuar con N lugar/lugares` | `Continuar · N entrada(s)` | “Lugar” asusta en GA. El medio punto + cantidad confirma el carrito. |
| Sin selección | `Continuar` (disabled) | `Elegí al menos una entrada` (disabled) | El vacío no enseña el bloqueo. |
| Barra flotante principal | usa `actionLabel` (bien) | Igual que arriba | — |
| Drawer carrito | **`Continuar a pago`** fijo (`checkout-floating-bar.tsx` **271**) | Reutilizar `actionLabel` | **Bug de copy:** en el paso 1 promete pago. Genera desconfianza cuando el siguiente paso es extras/datos. |

---

## 3. Paso de extras

**Ubicación:** `components/public/checkout-upsell-step.tsx`, CTA en `CheckoutTunnel.tsx` **2555–2558**, botones `Agregar` / `Agregado · N` en `QuantityList`.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Eyebrow | `Opcional` | Conservar | Baja la amenaza “¿me van a forzar el parking?”. |
| Título | `Mejorá tu experiencia` | `¿Sumás algo más?` | Pregunta > slogan. El slogan actual es genérico de e-commerce. |
| Helper | `Estacionamiento, consumiciones u otros extras. Podés seguir sin sumar nada.` | Conservar la segunda frase. Primera: `Estacionamiento o consumición. Se cobra ahora, con la entrada.` | Aclara que no es “en puerta en efectivo”. |
| Vacío | `No hay extras disponibles para este evento.` | No mostrar el paso (ideal) o `No hay extras. Seguimos al pago.` | Un empty state en un wizard es fricción. |
| CTA con extras | `Sumar extras y continuar` | `Continuar con extras` | Más corto; el carrito ya muestra el total. |
| CTA sin extras | `Continuar sin extras` | Conservar | **Mejor CTA del flujo.** Permiso explícito de skip = menos abandono. |
| Botón línea | `Agregar` / `Agregado · N` | `Sumar` / `En el carrito · N` | “Sumar” es más liviano que “Agregar” repetido. |

---

## 4. Datos del comprador

**Ubicación:** `CheckoutPaymentForm.tsx` **109–111**, `checkout-buyer-fields.tsx`.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Intro | `Los usamos para emitir tu entrada y encontrarte en puerta.` | **Presencial:** `Van en la entrada. En puerta pedimos DNI que coincida.` **ONLINE:** `Van a tu nombre. El link llega a este mail.` | El texto actual es presencial-only y no explica Email/DNI por campo. |
| Label email | `Mail` | `Email` | En AR ambos sirven; “Email” es el que la gente tipea en el teclado. |
| Placeholder email | `tunombre@email.com` | `ivan@gmail.com` | Ejemplo local, no genérico. |
| Helper email (**faltante**) | — | `Ahí mandamos el comprobante y el acceso. Revisá que no haya un typo.` | La sugerencia `¿Quisiste decir…?` (**134**) es excelente; el helper preventivo baja el error *antes*. |
| Nombre / apellido | placeholders `Ana` / `Pérez` | Conservar | Cortos, humanos. |
| Label DNI | `DNI` | Conservar | — |
| Placeholder DNI | `Solo números` | `30111222` | “Solo números” es instrucción de input, no ejemplo. La máscara ya recorta `\D`. |
| Helper DNI (**faltante**) | — | `La entrada queda nominada a este DNI. Tiene que ser el de quien ingresa.` | Máxima objeción de privacidad + máxima razón anti-fraude. Transparencia convierte. |
| Label teléfono | `Teléfono` | `Celular` | En AR “teléfono” = fijo. WhatsApp post-compra usa celular. |
| Helper teléfono | `Celular argentino. Se guarda como +549...` | `WhatsApp argentino. Lo usamos solo para esta compra (entradas y avisos del evento).` | El `+549` es implementación. El usuario quiere saber *para qué*, no el E.164. |
| CTA | `Continuar al pago` / `Continuar` (total 0) | `Continuar al pago` / `Emitir entrada gratis` | En $0, “Continuar” es tibio; “gratis” confirma que no hay trampa. |
| Título paso | `Confirmá tus datos` | Conservar | — |

---

## 5. Pago final y resumen

**Ubicación:** `CheckoutPaymentForm.tsx`, `payment-method-selector.tsx`, `tokepass-guarantee-badge.tsx`, `checkout-legal-clickwrap.tsx`, CTA `CheckoutTunnel.tsx` **2563–2567**.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Título | `Confirmá el pago` | `Pagá y listo` o conservar `Confirmá el pago` | El actual es correcto; el alternativo es más liviano en mobile. |
| Resumen | `Resumen de compra` | Conservar | — |
| Línea acceso | `1 acceso` / `N accesos` | `1 entrada` / `N entradas` | “Acceso” otra vez suena a control de puerta, no a ítem de carrito. |
| Total | `Total a pagar` + `Precio final All-In. Incluye servicio.` | `Total a pagar` + `Este es el precio final. Incluye servicio TokePass. No hay recargo en el siguiente paso.` | “All-In” es jerga de ticketing US/EU. Hay que traducirlo una vez. |
| Total $0 | `Entrada sin costo.` | `No se cobra nada.` | Más oral. |
| Promo | `Descuento ({code})` | Conservar | — |
| Medio | `Medio de pago` | Conservar | — |
| Payway | `Tarjetas de Crédito / Débito` + `Cuota Simple 3 y 6…` | Conservar | Específico = confianza. |
| MP | `Mercado Pago` + `Dinero en cuenta o tarjetas guardadas` | Conservar | — |
| Redirect | `Al confirmar, te redirigimos a la pasarela para pagar. El cobro se inicia solo cuando la reserva queda confirmada.` | `Te llevamos a {Mercado Pago / Payway} a pagar. El cupo queda reservado unos minutos.` | Nombrar la marca de la pasarela reduce el “¿es phishing?”. |
| Sandbox | `Este evento está en modo de prueba…` | Conservar | Claro. |
| Legal | `He leído y acepto los Términos…` | Conservar | Estándar clickwrap. |
| Garantía (presencial) | `Entrada nominada vinculada al DNI. Acceso 100% seguro sin intermediarios.` | `Entrada a tu nombre y DNI. En puerta no hace falta PDF ni reventa trucha.` | “Sin intermediarios” es abstracto; “reventa trucha” es el miedo real. |
| Garantía (ONLINE) | *la misma* | `Acceso nominado. El link llega a tu mail; no se publica en la ficha.` | El sello actual habla de “acceso” tipo puerta. |
| CTA pago | `Confirmar y Pagar $X` | Conservar el monto. Preferir `Pagar {monto}` | “Confirmar y” es redundante. El monto en el botón es el patrón de mayor conversión (Amazon/MP). |
| CTA $0 | `Confirmar reserva` | `Confirmar y emitir` | “Reserva” asusta (¿después me cobran?). |
| CTA prueba | `Simular Pago (Modo Prueba)` | Conservar | — |
| Drawer | `Continuar a pago` | Debe ser el mismo `Pagar {monto}` | Una sola promesa. |
| Timer | `Tiempo restante de reserva` (aria) | Visible: `Tu lugar se libera en mm:ss` | Si el timer no se lee, el usuario no entiende la urgencia. |

---

## 6. Post-compra y wallet

### 6.1 Confirmación de orden

**Ubicación:** `components/checkout/checkout-success-view.tsx`

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Pending | `Confirmando pago` / `Procesando tu pago` + *…forma segura…* | `Estamos confirmando el pago` + `No cierres esta pantalla.` | Evita el doble clic / back (ya bloquean history, el copy debe acompañar). |
| Timeout | `Esto esta tardando…` (sin tilde) | `Está tardando más de lo habitual. Si el débito se hizo, la entrada aparece acá o en Mis entradas.` | Ortografía + “débito” ancla el miedo “me cobraron y no hay ticket”. |
| Éxito eyebrow | `Pago confirmado` | Conservar | — |
| Éxito H1 | `Ya estas adentro` | `Ya estás adentro` | Falta tilde; en un H1 se nota. |
| Canal | `Te enviamos las entradas a tu WhatsApp y a tu correo electronico.` | Solo prometer canales **realmente disparados**. Si WhatsApp no siempre sale: `Te la mandamos por email. También quedó en Mis entradas.` | Promesa rota = ticket a soporte y review 1 estrella. |
| Helper QR (siempre) | `Tambien podes presentar el Living QR en {evento}…` | **Presencial:** `En puerta abrí Mis entradas y mostrá el Living QR. El código cambia solo: no sirve una captura.` **ONLINE:** `El botón para entrar al vivo está en Mis entradas. No hay QR de puerta.` | El copy actual es presencial para todos. |
| Sin tickets aún | `El pago esta acreditado. Abrí tu billetera…` | `Pago acreditado. En 1 minuto aparece el QR en Mis entradas.` | Da tiempo esperado. |
| CTA | `Descargar entradas ahora` | `Descargar PDF` (secundario) | El PDF contradice “no uses captura” del Living QR. Primario = `Ir a mis entradas`. Invertir jerarquía. |
| Link | `Ir a mis entradas` | Conservar como CTA principal | Es el hábito correcto. |
| Error | `La reserva expiro` / `No pudimos confirmar el pago` | `La reserva expiró` + `Si te cobraron, no vuelvas a pagar: escribinos con el número de orden.` | Tilde + instrucción anti-doble cobro. |

### 6.2 Detalle de entrada (wallet)

**Ubicación:** `components/account/ticket-detail-view.tsx`, `online-access-button.tsx`, `lib/events/delivery-mode.ts`.

| Pieza | Texto actual | Texto sugerido (Pro) | Razón UX |
| --- | --- | --- | --- |
| Back | `Volver a mis entradas` | Conservar | — |
| Hora | `Puertas` / `Inicio de transmisión` + hora | Ver §1.2 | Consistencia ficha ↔ wallet. |
| QR label | `Living QR` / `QR de ingreso` | `Living QR · mostralo en puerta` | El nombre de marca solo no instruye. |
| Helper dinámico | `Abrí esta pantalla al llegar. El código cambia cada 15 segundos.` | Conservar. Es el mejor microcopy de puerta del producto. | — |
| Helper estático | `Presentá este código en puerta. También sirve el PDF impreso.` | Conservar | — |
| Offline | `Modo sin conexión - QR disponible para lectura` | `Sin señal: el QR sigue sirviendo` | Más corto, más calma. |
| ONLINE CTA | `Acceder a la transmisión` | `Entrar al vivo` | Mismo verbo que el usuario usa en Instagram/YouTube. |
| ONLINE sin link | `El organizador todavía no cargó el link de transmisión.` | `El link se publica antes del inicio. Te avisamos por email.` | “El organizer no cargó” echa la culpa y genera bronca pre-evento. |
| Transferida | `Esta entrada ya no muestra QR vivo (fue transferida).` | `Esta entrada ya no es tuya: la transferiste.` | “QR vivo” es jerga. |
| Transfer pending | `Esperando que tu amigo acepte la entrada` | Conservar | Humano. |
| Reventa | `Entrada en venta. Relajate, nosotros nos encargamos.` | Conservar | Tono de marca. |
| Enviar | `Enviar a un amigo` | Conservar | — |

**Falta en ONLINE:** un recuadro de 2 líneas *antes* del botón:  
`El día del evento, tocá Entrar al vivo. El link es personal: no lo publiques.`

---

## 7. Mapa de CTAs (fuente de verdad)

Usar **un string por estado**. El dock mobile, el aside desktop, la barra del túnel y el drawer del carrito deben leer el mismo `actionLabel`.

| Paso | Presencial | Online |
| --- | --- | --- |
| Ficha | `Elegir entradas` | `Elegir acceso` |
| Selector (0 ítems) | `Elegí al menos una entrada` | igual |
| Selector (N) | `Continuar · N entradas` | igual |
| Extras (0) | `Continuar sin extras` | igual |
| Extras (>0) | `Continuar con extras` | igual |
| Datos | `Continuar al pago` | igual |
| Datos $0 | `Emitir entrada gratis` | `Emitir acceso gratis` |
| Pago | `Pagar {monto}` | igual |
| Pago $0 | `Confirmar y emitir` | igual |
| Success primario | `Ir a mis entradas` | igual |
| Wallet | `Living QR` (mostrar) | `Entrar al vivo` |

---

## 8. Prioridad de implementación (cuando se autorice escribir código)

**P0 (confusión / promesa falsa)**  
1. Unificar CTA ficha: nunca `Acceder` pre-compra.  
2. Success y garantía con rama `delivery_mode`.  
3. Drawer del carrito: dejar de hardcodear `Continuar a pago`.  
4. CTA selector: `entradas`, no `lugares`.

**P1 (fricción de formulario)**  
5. Helpers bajo Email y DNI.  
6. Intro de buyer distinta ONLINE vs PRESENCIAL.  
7. Traducir All-In en una frase.

**P2 (conversión fina)**  
8. Título + helper en selector de días.  
9. Escasez con número (`Quedan 6`).  
10. Invertir PDF vs “Ir a mis entradas” en success.  
11. Tildes en success/errores.

---

*Guía de copy, no de implementación. El siguiente paso es un PR solo de strings (sin cambiar layout ni persistencia), rama por `delivery_mode` donde esta tabla lo marca.*
