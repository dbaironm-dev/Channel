# SMS en Estados Unidos

En EE.UU. el canal es SMS, no WhatsApp. Eso no es solo cambiar de API: SMS trae dos capas
que WhatsApp no tiene, y las dos pueden costar dinero de verdad.

- **A2P 10DLC.** Sin registrar la marca y la campaña, los operadores **bloquean el 100%** del
  tráfico. No es una recomendación, es un filtro activo desde febrero de 2025.
- **TCPA.** Mandar publicidad sin consentimiento previo por escrito expone a daños legales de
  **500 a 1.500 USD por mensaje**. Con una lista de 400 clientes eso es una demanda colectiva,
  no una multa.

Este documento cubre las dos, más una tercera cosa que no es legal pero sí cara: la
codificación del mensaje.

---

## 1. El costo real de un SMS: los segmentos

Un SMS no se cobra por mensaje. Se cobra **por segmento**, y cuántos segmentos ocupa depende
de qué caracteres lleva.

- Si **todos** los caracteres están en el set **GSM-7**: 160 caracteres por segmento
  (153 si el mensaje se parte en varios).
- Si **uno solo** se sale de ese set: el mensaje **entero** pasa a **UCS-2** y la capacidad
  cae a 70 caracteres por segmento (67 en mensajes partidos).

Y aquí está la trampa para un mercado hispanohablante: **`á`, `í`, `ó`, `ú` no están en
GSM-7.** Sí están `é`, `ñ`, `ü`, `ä`, `ö`, `à`, `¿` y `¡`. Los emoji tampoco están, nunca.

El mismo mensaje, medido con la calculadora que lleva el workflow dentro:

| Versión del texto | Codificación | Segmentos | Por mensaje | 1.200/mes |
|---|---|---|---:|---:|
| Con emoji 👋 | UCS-2 | 2 | $0.0218 | $26.16 |
| Sin emoji, con tildes (`pasó`, `última`) | UCS-2 | 3 | $0.0327 | **$39.24** |
| Sin emoji ni tildes | GSM-7 | 1 | $0.0109 | **$13.08** |
| En inglés | GSM-7 | 1 | $0.0109 | $13.08 |

**Tres veces el costo por dos tildes.** Por eso las plantillas de ejemplo están escritas sin
acentos, y por eso el nodo `Seleccionar dormidos` calcula los segmentos del texto real y avisa
en el log cuando un carácter suelto disparó la factura:

```
AVISO_COSTO=["\"ó\" saca el mensaje de GSM-7: 3 segmentos en vez de 1"]
```

La suite `02-coherencia.js` también revisa las plantillas de la hoja y falla si alguna se sale
de GSM-7. Escribir sin tildes se ve descuidado; que el cliente pague el triple sin saberlo se
ve peor. Si el negocio prefiere las tildes, que sea una decisión suya con el número delante.

---

## 2. Registro A2P 10DLC

Sin esto no sale ni un mensaje. Los operadores bloquean todo el tráfico no registrado, y el
error que verás es `30034`.

### Qué se registra

1. **La marca (Brand).** Datos legales del negocio: razón social, EIN, dirección, sitio web.
   Se envía a The Campaign Registry a través de Twilio.
2. **La campaña (Campaign).** Para qué se manda, con ejemplos del mensaje real y **prueba de
   cómo consintió cada destinatario**. Esta es la parte que rechazan.

### Costos aproximados (2026)

| Concepto | Costo |
|---|---|
| Verificación de marca | desde ~$48, una vez |
| Registro de campaña | ~$15 una vez + ~$10/mes |
| Recargo de operador por mensaje | $0.003–$0.005 por segmento |
| Número local en Twilio | ~$1.15/mes |
| Base de Twilio por segmento | $0.0079 |

En la hoja `tarifas` está puesto **$0.0109 por segmento** = $0.0079 de Twilio + $0.003 de
recargo. Ajústalo si tu mezcla de operadores sale distinta.

### Plazos

Marca: 1–3 días hábiles. Campaña: 3–7 días hábiles, y hasta 10–15 en temporada alta. **Cuenta
de una a cuatro semanas de punta a punta** y no le prometas al cliente que arranca el lunes.

### Lo que hace que rechacen una campaña

- Descripción vaga del caso de uso. Escribe exactamente qué se manda y a quién.
- Ejemplos de mensaje que no coinciden con lo que se manda de verdad.
- No poder explicar cómo se recogió el consentimiento.
- Falta de instrucción de baja en el propio texto.

---

## 3. TCPA: consentimiento y horarios

### Consentimiento previo por escrito

Un mensaje de «vuelve a la barbería» **es marketing**, no es una notificación de servicio.
Requiere consentimiento previo por escrito, y el negocio tiene que poder probarlo.

Por eso la hoja `clientes` tiene tres columnas que no son decorativas:

| Columna | Para qué |
|---|---|
| `consentimiento` | `si` / `no`. Sin `si`, el workflow **nunca** selecciona a ese cliente |
| `fecha_consentimiento` | Cuándo lo dio |
| `origen_consentimiento` | Dónde: formulario en el local, reserva online, etc. |

El formulario donde firman debe decir, con claridad y a la vista, que aceptan recibir
**mensajes de marketing automatizados**, que pueden aplicar tarifas de datos, y que responder
STOP los saca. Aceptar no puede ser condición para recibir el servicio.

**Una lista de teléfonos sacada del sistema de reservas no es consentimiento.** Que un cliente
te haya dado su número para confirmarle una cita no autoriza a mandarle publicidad. Esta es la
conversación incómoda que hay que tener con el dueño antes de encender nada, y la que separa
una campaña de una demanda.

### Horarios

La TCPA restringe el envío a **8:00–21:00 hora local del destinatario**.

El workflow usa una ventana más estrecha a propósito, **9:00–20:00**, calculada sobre la
`zona_horaria` de la barbería. El margen cubre el desfase entre la zona del local y la del
cliente. Si el cron dispara fuera de esa ventana, el negocio se salta el día entero y lo deja
escrito en el log:

```
por_negocio=[{"negocio_id":"brb001","omitido":"fuera_de_horario_local_22h"}]
```

Texas está en `America/Chicago`. Ojo si el cliente está en El Paso, que es `America/Denver`.

### Opt-out

Desde abril de 2025 hay que honrar la revocación hecha por **cualquier método razonable**, no
solo por la palabra STOP. Y hay que procesarla en **10 días hábiles** como máximo.

El reparto de responsabilidades queda así:

- **Twilio intercepta por su cuenta** STOP, END, QUIT, CANCEL y UNSUBSCRIBE. Esos mensajes
  **no llegan al webhook**, y Twilio bloquea los envíos futuros a ese número. Si lo intentas
  igual, la API responde `21610`.
- **El workflow 02 atrapa el resto**: «take me off your list», «stop texting me», «ya no me
  manden mensajes», «quitame de la lista». Marca `optout = si` en la hoja y contesta
  confirmando.
- **El workflow 01 cierra el círculo**: cuando un envío falla con `21610`, marca al cliente
  como dado de baja en la hoja, para que la hoja y el operador no se contradigan.

Ese tercer punto importa: sin él, la hoja diría `optout = no` para siempre, el workflow
seguiría seleccionándolo cada 60 días y acumularías errores `21610` sin entender por qué.

### SHAFT

Nada de sexo, odio, alcohol, armas de fuego ni tabaco. Una barbería que sortea una botella de
whisky no puede anunciarlo por SMS.

---

## 4. Los tres mensajes

Los textos viven en la hoja `negocios`, no en el código, y admiten marcadores. El workflow los
sustituye antes de medir los segmentos.

Marcadores: `{nombre}`, `{negocio}`, `{servicio}`, `{nombre_completo}`, `{telefono}`,
`{enviados}`.

### `sms_plantilla` — al cliente dormido

```
{negocio}: hola {nombre}, ya paso un tiempo desde tu ultima visita. Te apartamos lugar esta semana para {servicio}? Responde SI. STOP para no recibir mas.
```

152 caracteres, GSM-7, **1 segmento**. Identifica al negocio en la primera palabra (los
operadores lo exigen) y dice cómo salir.

Versión en inglés, también de 1 segmento:

```
{negocio}: hi {nombre}, it's been a while since your last visit. Want us to save you a spot this week for {servicio}? Reply YES. STOP to opt out.
```

### `sms_aviso` — al dueño, cuando alguien quiere cita

```
{negocio}: {nombre_completo} quiere agendar. Tel: {telefono}. Contactalo hoy para cerrar la cita.
```

### `sms_resumen` — al dueño, al final del día

```
{negocio}: hoy contactamos a {enviados} clientes que llevaban tiempo sin venir. Te avisamos en cuanto alguno responda.
```

No lo quites por ahorrar. Cuesta centavos al mes y es lo que evita que cancelen a los tres
meses: un servicio que no se ve, se cancela.

---

## 5. Configurar Twilio

1. Crea la cuenta y compra un número local del área del negocio. Un número de Dallas para una
   barbería de Dallas responde mejor que uno genérico.
2. Crea un **Messaging Service** y mete el número dentro. Es lo que va en la columna
   `sms_remitente` (empieza por `MG`). Si prefieres un número suelto, pon el número en E.164
   y el workflow lo usa como `From`.
3. Registra la marca y la campaña 10DLC, y espera la aprobación.
4. En n8n, crea una credencial **Basic Auth**: usuario = Account SID, contraseña = Auth Token.
5. Pon el Account SID en el nodo `Config` de los workflows 01 y 02.
6. En el Messaging Service, apunta el webhook de mensajes entrantes a la URL del nodo
   `SMS entrante (Twilio)` del workflow 02.
7. Configura también el **status callback** a esa misma URL para recibir los acuses de entrega.

### Toll-free como alternativa

Un número toll-free no necesita registro 10DLC, pero sí verificación toll-free, que también
tarda. Para una barbería local un número del área funciona mejor: se reconoce, y los números
toll-free tienen fama de spam.

---

## 6. Códigos de error de Twilio que verás

El workflow los traduce y decide qué hacer con cada uno.

| Código | Qué pasó | Qué hace el workflow |
|---|---|---|
| `30034` | El número no está registrado en 10DLC | Avisa al operador. Todo está bloqueado |
| `21610` | El cliente hizo opt-out en el operador | Lo marca de baja en la hoja |
| `21614` | El destino no es un móvil | Descarta el número |
| `30006` | Línea fija o el operador no acepta SMS | Descarta el número |
| `30005` | El número no existe | Descarta el número |
| `30007` | El operador lo filtró como spam | Avisa al operador: revisa texto y volumen |
| `30003` | Teléfono apagado o sin cobertura | Reintenta otro día |
| `20003` | Credenciales de Twilio inválidas | Avisa al operador |
| `20429` | Demasiadas peticiones | Reintenta otro día |

`30007` es el que hay que vigilar. Significa que los operadores están tratando los mensajes
como spam, y se llega ahí por escribir a gente que no lo esperaba. Si aparece, el problema es
la lista, no el texto: sube `umbral_dias`, baja `max_por_dia` y revisa de dónde salieron esos
números.

---

## 7. Cuánto cuesta al mes, de verdad

Una barbería con 40 mensajes al día, textos en GSM-7 de 1 segmento:

| Concepto | Mensual |
|---|---|
| 1.200 SMS salientes × $0.0109 | $13.08 |
| ~120 respuestas entrantes × $0.0079 | $0.95 |
| Avisos al dueño y resúmenes | ~$0.50 |
| Número de Twilio | $1.15 |
| Campaña 10DLC | $10.00 |
| **Total** | **~$26/mes** |

Más los ~$63 de alta que se pagan una vez (verificación de marca y registro de campaña).

Contra eso: un corte en Texas ronda los 30 USD. **Recuperar un solo cliente al mes ya paga
el canal entero.** Ese es el número con el que se vende, y sale de la hoja `log_mensajes`,
no de una promesa.
