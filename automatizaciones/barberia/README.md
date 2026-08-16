# Reactivación de clientes dormidos — barberías

Plantilla de automatización en n8n que detecta a los clientes de una barbería que llevan
demasiado tiempo sin venir, les escribe, y devuelve al dueño a los que responden.

Está construida como **producto, no como proyecto**: un solo juego de workflows sirve para
todas las barberías. Lo único que cambia entre clientes es una fila en una hoja de cálculo.

**Dos canales, un motor.** La columna `canal` de cada negocio decide por dónde sale el
mensaje:

- **`sms`** — Estados Unidos, vía Twilio. Es el canal por defecto. Lee
  [sms-estados-unidos.md](sms-estados-unidos.md) **antes de tocar nada**: SMS trae registro
  A2P 10DLC y TCPA, y las dos cosas cuestan dinero si se ignoran.
- **`whatsapp`** — México y Latinoamérica, vía Meta Cloud API. Ver
  [plantillas-whatsapp.md](plantillas-whatsapp.md).

La lógica de selección, los umbrales, el registro de costo y las pruebas son las mismas para
los dos. Lo único que cambia es la última milla.

---

## Por qué esto y no un sistema de reservas

Booksy cuesta ~1 USD/día y Fresha arranca en ~20 USD/mes, y los dos hacen reservas,
recordatorios y ficha de cliente mejor de lo que se puede hacer en n8n. Competir con eso es
perder.

Lo que ninguno hace es mirar la lista de clientes y darse cuenta de que **el que lleva 50 días
sin aparecer no está ocupado: se está yendo**. El corte de pelo tiene un ciclo de 3 a 4
semanas; cruzar el día 45 sin volver es la señal más clara que existe en este negocio, y nadie
la está usando.

---

## Antes de tocar nada: la licencia

n8n se distribuye bajo la [Sustainable Use License](https://docs.n8n.io/sustainable-use-license/),
que **no** es open source al uso. Puedes usarlo y modificarlo gratis para fines internos de un
negocio, pero no puedes ofrecerlo como servicio a terceros.

| | Quién paga n8n | Quién es dueño de la instancia | Estado |
|---|---|---|---|
| **A. Recomendado** | El cliente | El cliente | Vendes servicio profesional. Sin ambigüedad. |
| **B. Zona gris** | Tú | Tú, el cliente nunca la ve | Puede caer dentro de la licencia. Difuso en cuanto cada cliente tiene "sus" workflows. |
| **C. Descartado** | Tú | Multi-tenant con cuentas por cliente | Licencia Embed, ~50.000 USD/año. |

**Ve por A.** En ese caso la hoja `negocios` tiene exactamente una fila. El soporte
multi-negocio existe para que la plantilla sea la misma en todas partes, no para invitarte al
camino C.

---

## Lo que necesitas

**Siempre:**

- Una instancia de n8n (Cloud o autoalojada) con salida a internet.
- Un **Google Sheet** con las seis pestañas de `hojas/`.
- Opcional pero recomendado: un bot de Telegram para las alertas de fallo.

**Si el canal es SMS (EE.UU.):**

- Cuenta de **Twilio** con un número local y un Messaging Service.
- **Registro A2P 10DLC aprobado** (marca + campaña). Sin esto los operadores bloquean el
  100% del tráfico. Cuenta de 1 a 4 semanas.
- **Consentimiento previo por escrito** de cada cliente de la lista. No es opcional.

**Si el canal es WhatsApp:**

- Cuenta de **Meta Business** verificada con el número en la Cloud API.
- Las tres plantillas aprobadas.
- Avísale al dueño antes: migrar el número lo saca de la app de WhatsApp Business.

---

## Puesta en marcha

### 1. La hoja de cálculo

Seis pestañas con estos nombres exactos, importando el CSV correspondiente de `hojas/`:

| Pestaña | Qué guarda | Quién escribe |
|---|---|---|
| `negocios` | Una fila por barbería: canal, umbrales, topes, textos | Tú |
| `clientes` | La base de clientes, con su consentimiento | El negocio |
| `log_mensajes` | Cada mensaje, con su costo y resultado | Workflows 01 y 02 |
| `tarifas` | Precio por país, canal y categoría | Tú |
| `resumen_diario` | Una fila por negocio y día | Workflow 01 |
| `errores` | Fallos capturados, con su gravedad | Workflow 03 |

Anota el **ID del documento** (el tramo entre `/d/` y `/edit` en la URL).

> `cliente_id` tiene que ser único en toda la hoja, no solo dentro de un negocio: los nodos de
> actualización buscan por esa columna. Con varias barberías, prefija el id (`brb001-c001`).

### 2. Credenciales en n8n

Ninguna se guarda dentro de los workflows:

1. **Google Sheets OAuth2** — para las seis pestañas.
2. **Basic Auth** — usuario = Twilio Account SID, contraseña = Auth Token. Para el canal SMS.
3. **Header Auth** — nombre `Authorization`, valor `Bearer TU_TOKEN` de Meta. Para WhatsApp.
4. **Telegram** (opcional) — solo para el workflow 03.

Si solo vas a usar un canal, crea solo esa credencial: los nodos del otro nunca se ejecutan.

### 3. Importar y configurar

Importa los tres JSON de `workflows/`. En cada uno hay un nodo **`Config`** que es el único
sitio que se edita:

| Workflow | Qué poner |
|---|---|
| 01 | `sheet_id`, `twilio_account_sid`, `graph_version`, `modo_prueba`, `tam_lote`, `espera_entre_lotes_seg` |
| 02 | `sheet_id`, `twilio_account_sid`, `graph_version` + el verify token en `¿Verify token correcto?` (solo WhatsApp) |
| 03 | `sheet_id`, `chat_id_operador` |

Después, en **Settings → Error Workflow** de los workflows 01 y 02, selecciona
`Barbería · 03 Manejador de errores`. Sin esto, un fallo pasa inadvertido.

### 4. Conectar los webhooks

**Twilio:** activa el workflow 02 y copia la URL de producción del nodo
`SMS entrante (Twilio)`. En el Messaging Service, apúntala como webhook de mensajes entrantes
**y** como status callback.

**Meta:** copia la URL del nodo `Evento de Meta (POST)`. En Meta → WhatsApp → Webhooks, pon esa
URL y el mismo verify token que pusiste en el nodo IF. Suscríbete a `messages` **y**
`message_status`.

### 5. Probar sin gastar

El workflow 01 viene con **`modo_prueba` en `si`**. Déjalo así y ejecútalo a mano.

No se manda un solo mensaje, pero se escribe en `log_mensajes` exactamente la misma fila que
se escribiría de verdad —con su codificación, sus segmentos y el costo que habría tenido.
Revisa esas filas **con el dueño de la barbería**: si hay alguien ahí que no debería recibir el
mensaje, ajusta umbrales antes de gastar nada.

El nodo `Seleccionar dormidos` deja además un resumen en el log de la ejecución:

```
por_negocio=[{"negocio_id":"brb001","canal":"sms","hora_local":10,"candidatos":37,"elegidos":37,"frenados_por_tope":0,"segmentos":37,"costo_estimado_usd":0.4033}]
descartes={"aun_activo":214,"sin_consentimiento":31,"ya_tiene_cita":11,"demasiado_frio":52}
AVISO_COSTO=["\"ó\" saca el mensaje de GSM-7: 3 segmentos en vez de 1"]
```

Eso responde «¿por qué hoy solo salieron 3?» sin abrir nada más — y avisa si un carácter
suelto está triplicando la factura.

Cuando esté bien, pon `modo_prueba` en `no` y activa el cron.

---

## Cómo funciona

### Workflow 01 · Reactivación (cron diario, 10:00 hora local)

Lee las cuatro hojas y decide a quién escribir en un solo nodo de código. Un cliente entra
solo si pasa **todas** estas:

| Regla | Por qué |
|---|---|
| Tiene `consentimiento = si` | En EE.UU. es la diferencia entre una campaña y una demanda |
| `optout` no es `si` | Obligación legal, además de sentido común |
| Teléfono con 10 dígitos o más | Evita quemar envíos en basura |
| Días desde la última visita ≥ `umbral_dias` (45) | Antes de eso todavía no está dormido |
| Días desde la última visita ≤ `umbral_max_dias` (120) | Más allá la recuperación se desploma |
| Sin cita futura agendada | Escribirle es contraproducente |
| Sin contacto en los últimos `cooldown_dias` (60) | Reconstruido desde el log, no desde la ficha |
| El negocio abre hoy (`dias_habiles`) | Nadie contesta si el local está cerrado |
| Son entre las 9:00 y las 20:00 **en la zona del negocio** | La TCPA permite 8–21; el margen cubre el desfase |

Los que pasan se ordenan **de menos a más tiempo dormidos** —los más recuperables primero— y
se corta en `max_por_dia`. Para SMS calcula la codificación y los segmentos del texto real, y
de ahí sale el costo. El envío va por lotes con espera entre uno y otro, y cada llamada
reintenta hasta 3 veces.

### Workflow 02 · Respuestas (webhook)

Un solo workflow atiende los dos proveedores. Twilio manda un formulario plano y Meta un JSON
anidado; el primer nodo los normaliza a la misma forma y de ahí todo es común.

- **Mensajes.** Identifica al cliente, deduce la intención (por el payload del botón en
  WhatsApp, interpretando texto en SMS), actualiza su ficha, le contesta y avisa al dueño si
  quiere agendar.
- **Acuses de entrega.** Se escribe sobre la fila del log con ese identificador. En WhatsApp
  llega además el dato de costo real que reporta Meta.

Dos detalles que rompen esto en silencio si no se contemplan:

**Los números no vuelven como se enviaron.** En EE.UU. el mismo teléfono aparece con y sin el
`1` de país; en México WhatsApp quita o pone un `1` tras el `52`; en Argentina hace lo mismo
con el `9`. El workflow genera las variantes y busca por todas.

**Twilio no reenvía todos los opt-out.** Intercepta STOP, END, QUIT, CANCEL y UNSUBSCRIBE por
su cuenta, y esos nunca llegan al webhook. Pero desde abril de 2025 hay que honrar la
revocación por «cualquier método razonable», y frases como «take me off your list» **sí**
llegan. La lista de palabras del workflow existe para atraparlas.

### Workflow 03 · Errores

Un solo Error Workflow para los otros dos. Clasifica en transitorio (se arregla solo),
revisar, o crítico (el servicio está caído). La alerta va al operador por Telegram.
**Nunca al cliente.**

---

## Dar de alta una barbería nueva

1. Añade una fila en `negocios`, con su `canal` y su `zona_horaria`. Los valores por defecto
   (45 / 120 / 60 / 40) son un buen punto de partida.
2. Importa su base de clientes con `negocio_id` correcto, `cliente_id` único y **la columna
   de consentimiento llena de verdad**.
3. Da de alta el remitente: Messaging Service de Twilio, o `phone_number_id` de Meta.
4. Registra 10DLC (SMS) o aprueba las plantillas (WhatsApp).
5. Corre el workflow 01 en `modo_prueba` y revisa la selección **con el dueño**.
6. Pon `activo` en `si`.

No hace falta tocar ningún workflow. Si lo tocas para un cliente concreto, ya perdiste la
ventaja de tener una plantilla.

---

## Ajustar la campaña

Todo se mueve desde la hoja `negocios`, sin abrir n8n:

| Columna | Por defecto | Súbelo si… | Bájalo si… |
|---|---|---|---|
| `umbral_dias` | 45 | Molestas a gente que sí venía | Quieres cazar antes la fuga |
| `umbral_max_dias` | 120 | La base es chica y quieres alcance | Gastas en gente irrecuperable |
| `cooldown_dias` | 60 | Recibes quejas de insistencia | Nunca; 60 ya es agresivo |
| `max_por_dia` | 40 | El dueño da abasto con las respuestas | Se le juntan más citas de las que puede atender |

El tope diario existe por una razón que no es técnica: si mandas 400 mensajes de golpe y
responden 60, la barbería no da abasto, la experiencia es mala y el dueño culpa al sistema.

---

## Qué mirar cada semana

Todo sale de `log_mensajes`:

- **Tasa de respuesta** = filas `tipo=respuesta` ÷ `tipo=reactivacion` enviadas.
- **Tasa de recuperación** = clientes con `agendo=si` ÷ enviados. Es el número que vende.
- **Costo real** = suma de `costo_estimado_usd` donde `facturable=si`.
- **Segmentos por mensaje.** Si sube de 1, alguien metió una tilde o un emoji en la plantilla.
- **Bajas.** Si suben, el mensaje o la lista están mal.
- Filas con `accion=avisar_operador`: necesitan un humano hoy.

Para la venta, la cuenta se hace con los números del cliente: cuántos clientes tiene con más
de 45 días sin venir, cuánto vale un corte, y cuántos recuperó el primer mes. Ese primer
número casi siempre lo deja frío, porque nadie lo ha mirado nunca.

---

## Cuando algo falla

| Síntoma | Causa casi segura |
|---|---|
| Todos los SMS dan `30034` | La campaña 10DLC no está aprobada. Nada sale hasta que lo esté |
| SMS con `21610` | El cliente hizo opt-out en el operador. El workflow lo marca en la hoja |
| SMS con `30007` | Los operadores lo filtran como spam. El problema es la lista, no el texto |
| SMS con `20003` | Credenciales de Twilio mal puestas en la credencial Basic Auth |
| El costo por mensaje se dobló o triplicó | Una tilde o un emoji en la plantilla. Mira `encoding` en el log |
| Todos los WhatsApp dan `132001` | La plantilla no está aprobada en ese idioma |
| WhatsApp con `190` | El token de Meta caducó. Usa uno permanente de System User |
| Se envía pero no hay acuses | Falta el status callback (Twilio) o `message_status` (Meta) |
| Las respuestas no identifican al cliente | `cliente_id` no es único, o el teléfono tiene formato raro |
| No selecciona a nadie | Mira `descartes=` y `omitido=` en el log. Suele ser `sin_consentimiento`, `hoy_no_abre` o `fuera_de_horario` |

---

## Lo que esto no hace

- **No agenda citas.** Avisa al dueño y él cierra. Automatizarlo exige integrarse con su
  calendario, y ahí cada barbería es un mundo.
- **No cobra ni gestiona pagos.**
- **No sustituye a Booksy ni a Fresha.** Se pone encima.
- **No importa clientes solo.** La primera carga es manual o exportada de su sistema.
- **No recoge el consentimiento.** Eso es un formulario en el local o en su web, y es
  responsabilidad del negocio. El workflow solo lo respeta.
- **No adivina texto libre complicado.** Si alguien pregunta el precio, lo marca y lo pasa a
  un humano, a propósito.

---

## Archivos

```
automatizaciones/barberia/
├── README.md                          este documento
├── sms-estados-unidos.md              10DLC, TCPA, segmentos y costos reales
├── plantillas-whatsapp.md             textos exactos para aprobar en Meta
├── hojas/                             6 CSV importables como pestañas
├── workflows/
│   ├── 01-reactivacion-dormidos.json  27 nodos · cron diario
│   ├── 02-respuestas-entrantes.json   27 nodos · webhooks Twilio + Meta
│   └── 03-manejador-errores.json       7 nodos · error trigger
└── pruebas/                           5 suites, sin dependencias
    └── ejecutar.sh
```

Los tres JSON se versionan aquí a propósito. El editor visual de n8n invita a tocar en
producción y romper cosas sin historial; si cambias algo, exporta y commitea.

### Pruebas

```bash
./automatizaciones/barberia/pruebas/ejecutar.sh
```

224 comprobaciones que corren la lógica de los nodos Code fuera de n8n, con sobres reales de
Twilio y de la Cloud API y las hojas de ejemplo como datos: sintaxis, coherencia entre
workflows y hojas, reglas de selección, horarios y zonas horarias, cálculo de segmentos,
clasificación de errores de ambas APIs, e interpretación de respuestas.

Entre ellas hay una que vigila el dinero: **falla si alguna plantilla SMS de la hoja se sale
de GSM-7**, porque eso multiplica la factura sin que nadie se entere.

**Córrelas cada vez que exportes un workflow desde n8n.** El editor no avisa si renombras una
columna, y ese fallo aparece a las 10:00 del día siguiente, sobre dinero real.
