# Plantillas de WhatsApp

Las tres plantillas que hay que dar de alta en **Meta Business Manager → WhatsApp Manager →
Plantillas de mensajes** antes de encender nada. Sin ellas aprobadas, el workflow 01 falla con
`132001` en todos los envíos.

Los nombres de abajo son los que van en las columnas `plantilla_reactivacion`,
`plantilla_resumen` y `plantilla_aviso` de la hoja `negocios`. Si cambias un nombre aquí,
cámbialo también en la hoja.

> **Sobre la categoría.** Tú propones una categoría al crear la plantilla, pero **Meta la
> reclasifica por su cuenta** y su decisión es la que se factura. Después de aprobarlas,
> vuelve a WhatsApp Manager y comprueba la categoría real. Si Meta mueve una de utility a
> marketing, el costo se multiplica y hay que actualizar la hoja `tarifas`.

---

## 1. `reactivacion_barberia_v1` — MARKETING

El mensaje que despierta al cliente dormido. Es marketing sin discusión: no hay ninguna
transacción previa que justifique utility, y va fuera de la ventana de 24 h por definición
(si el cliente estuviera hablando contigo, no estaría dormido).

**Idioma:** Español (MEX) → `es_MX`

**Cuerpo:**

```
Hola {{1}} 👋 Ya pasó un rato desde tu última visita a {{2}}.

¿Te apartamos lugar esta semana para {{3}}?
```

**Pie de página:**

```
Responde BAJA si no quieres recibir más mensajes.
```

**Botones** — tres de respuesta rápida, en este orden exacto (el índice importa, el workflow
manda el payload por posición):

| Índice | Texto del botón | Payload que devuelve Meta |
|---|---|---|
| 0 | `Sí, agéndame` | `AGENDAR` |
| 1 | `Ahora no` | `AHORA_NO` |
| 2 | `BAJA` | `BAJA` |

**Valores de ejemplo para la aprobación** (Meta los pide obligatoriamente):

- `{{1}}` → `Juan`
- `{{2}}` → `El Corte`
- `{{3}}` → `Corte y barba`

**Por qué está redactado así.** Los botones no son adorno: convierten la respuesta en un
payload determinista (`AGENDAR`) en vez de texto libre que hay que adivinar. El workflow 02
interpreta texto libre si hace falta, pero acierta mucho más con el botón. Y el botón de BAJA
visible reduce los reportes de spam, que es lo que destruye la calidad del número.

---

## 2. `aviso_cliente_interesado_v1` — UTILITY

Avisa al dueño de la barbería que un cliente quiere cita. Se dispara desde el workflow 02.

**Idioma:** `es_MX`

**Cuerpo:**

```
{{1}}: {{2}} quiere agendar.

Teléfono: {{3}}

Contáctalo hoy para cerrar la cita.
```

**Valores de ejemplo:**

- `{{1}}` → `El Corte`
- `{{2}}` → `Juan Pérez`
- `{{3}}` → `5215511111111`

Sin botones ni pie de página.

**Justificación de utility:** es una notificación operativa sobre la cuenta del propio
destinatario, disparada por un evento concreto. Encaja en utility, pero verifica la
categoría después de la aprobación — este es el caso donde Meta reclasifica más a menudo.

---

## 3. `resumen_diario_barberia_v1` — UTILITY

El resumen que hace visible el trabajo. Se manda solo los días en que hubo envíos.

**Idioma:** `es_MX`

**Cuerpo:**

```
{{1}}: hoy contactamos a {{2}} clientes que llevaban tiempo sin venir.

Te avisamos aquí en cuanto alguno responda.
```

**Valores de ejemplo:**

- `{{1}}` → `El Corte`
- `{{2}}` → `12`

Sin botones ni pie de página.

**No lo quites por ahorrar.** Cuesta céntimos al mes y es lo que evita la cancelación a los
tres meses: un servicio que el dueño no ve, es un servicio que el dueño cancela.

---

## Lo que no se puede mandar

- **Nada fuera de plantilla si han pasado más de 24 h** desde el último mensaje del cliente.
  El workflow 02 responde con texto libre solo porque el cliente acaba de escribir, y eso
  abre la ventana de servicio.
- **Sin opt-in no se manda nada.** Los clientes de la hoja tienen que haber dado su número al
  negocio y aceptado recibir mensajes. Una lista comprada tumba el número, y el número es el
  negocio del cliente.
- **Meta limita cuántos mensajes de marketing recibe una persona al día**, sin importar quién
  los mande. Si un envío vuelve con `131049` o `130472`, no es un fallo tuyo: ese usuario ya
  llegó a su tope. El workflow lo marca como `reintentar_manana` y sigue.

## Cuando una plantilla se pausa

Si la calidad baja, Meta pausa la plantilla (`132015`) y luego la deshabilita (`132016`). Se
llega ahí por bloqueos y reportes de spam, casi siempre por escribir a gente que no esperaba
el mensaje. Si pasa:

1. No crees `..._v2` para esquivarlo. El problema es la lista, no el texto.
2. Sube `umbral_dias` y baja `max_por_dia` en la hoja `negocios`.
3. Revisa de dónde salieron esos números y quién dio opt-in de verdad.
