# Reactivación de clientes dormidos — barberías

Plantilla de automatización en n8n que detecta a los clientes de una barbería que llevan
demasiado tiempo sin venir, les escribe por WhatsApp, y devuelve al dueño a los que responden.

Está construida como **producto, no como proyecto**: un solo juego de workflows sirve para
todas las barberías. Lo único que cambia entre clientes es una fila en una hoja de cálculo.

---

## Por qué esto y no un sistema de reservas

Booksy cuesta ~1 USD/día y Fresha arranca en ~20 USD/mes, y los dos hacen reservas,
recordatorios y ficha de cliente mejor de lo que se puede hacer en n8n. Competir con eso es
perder.

Lo que ninguno hace es mirar la lista de clientes y darse cuenta de que **el que lleva 50 días
sin aparecer no está ocupado: se está yendo**. El corte de pelo tiene un ciclo de 3 a 4
semanas; cruzar el día 45 sin volver es la señal más clara que existe en este negocio, y nadie
la está usando.

Eso es lo que automatiza esto, y por eso es el primer workflow que conviene vender.

---

## Antes de tocar nada: la licencia

n8n se distribuye bajo la [Sustainable Use License](https://docs.n8n.io/sustainable-use-license/),
que **no** es open source al uso. Puedes usarlo y modificarlo gratis para fines internos de un
negocio, pero no puedes ofrecerlo como servicio a terceros.

Para este trabajo eso deja dos caminos limpios:

| | Quién paga n8n | Quién es dueño de la instancia | Estado |
|---|---|---|---|
| **A. Recomendado** | El cliente | El cliente | Vendes servicio profesional. Sin ambigüedad. |
| **B. Zona gris** | Tú | Tú, el cliente nunca la ve | Puede caer dentro de la licencia. Difuso en cuanto cada cliente tiene "sus" workflows. |
| **C. Descartado** | Tú | Multi-tenant con cuentas por cliente | Licencia Embed, ~50.000 USD/año. |

**Ve por A.** El cliente paga n8n Cloud (24 €/mes) o su propio VPS, la cuenta está a su
nombre, y tú cobras implementación más mantenimiento. En ese caso la hoja `negocios` tiene
exactamente una fila. El soporte multi-negocio existe para que la plantilla sea la misma en
todas partes, no para invitarte al camino C.

---

## Lo que necesitas

- Una instancia de n8n (Cloud o autoalojada) con acceso a internet saliente.
- Cuenta de **Meta Business** verificada, con un número dado de alta en la **WhatsApp Cloud
  API** y las [tres plantillas](plantillas-whatsapp.md) aprobadas.
- Un **Google Sheet** con las seis pestañas de `hojas/`.
- Opcional pero recomendado: un bot de Telegram para las alertas de fallo.

El número de WhatsApp tiene que ser del negocio y no puede estar usándose en la app normal de
WhatsApp Business. Migrarlo a la Cloud API lo saca de la app del teléfono; avísale al dueño
antes, no después.

---

## Puesta en marcha

### 1. La hoja de cálculo

Crea un Google Sheet con seis pestañas, nombradas exactamente así, e importa el CSV
correspondiente de `hojas/` en cada una:

| Pestaña | Qué guarda | Quién escribe |
|---|---|---|
| `negocios` | Un renglón por barbería: umbrales, topes, plantillas | Tú |
| `clientes` | La base de clientes | El negocio (o una importación) |
| `log_mensajes` | Cada mensaje enviado o recibido, con su costo | Los workflows |
| `tarifas` | Precio por país y categoría | Tú |
| `resumen_diario` | Una fila por negocio y día | El workflow 01 |
| `errores` | Fallos capturados | El workflow 03 |

Anota el **ID del documento** (el tramo largo de la URL entre `/d/` y `/edit`).

> `cliente_id` tiene que ser único en toda la hoja, no solo dentro de un negocio: los nodos de
> actualización buscan por esa columna. Si vas a tener varias barberías, prefija el id
> (`brb001-c001`).

### 2. Credenciales en n8n

Tres, y ninguna se guarda en los workflows:

1. **Google Sheets OAuth2** — para las seis pestañas.
2. **Header Auth** (`httpHeaderAuth`) — nombre `Authorization`, valor `Bearer TU_TOKEN` con el
   token permanente de la app de Meta. La usan todos los nodos HTTP.
3. **Telegram** (opcional) — solo para el workflow 03.

Al importar los workflows, cada nodo que necesite credencial aparecerá marcado. Selecciónalas
una vez y listo.

### 3. Importar y configurar

Importa los tres JSON de `workflows/`. En cada uno hay un nodo **`Config`** que es el único
sitio que se edita:

| Workflow | Qué poner |
|---|---|
| 01 | `sheet_id`, `graph_version` (`v21.0`), `modo_prueba`, `tam_lote`, `espera_entre_lotes_seg` |
| 02 | `sheet_id`, `graph_version` + el verify token en el nodo `¿Verify token correcto?` |
| 03 | `sheet_id`, `chat_id_operador` |

Después, en **Settings → Error Workflow** de los workflows 01 y 02, selecciona
`Barbería · 03 Manejador de errores`. Sin esto, un fallo pasa inadvertido.

### 4. Conectar el webhook de Meta

Activa el workflow 02 y copia la URL de producción del nodo `Evento entrante (POST)`. En
**Meta → WhatsApp → Configuración → Webhooks**:

- URL de devolución de llamada: la de n8n.
- Token de verificación: el mismo string que pusiste en `¿Verify token correcto?`.
- Suscríbete a los campos `messages` **y** `message_status`.

Meta hará un GET de verificación; el workflow le devuelve el `hub.challenge`. Si falla, el
token no coincide.

### 5. Probar sin gastar

El workflow 01 viene con **`modo_prueba` en `si`**. Déjalo así y ejecútalo a mano.

No se manda un solo mensaje, pero se escribe en `log_mensajes` exactamente la misma fila que
se escribiría de verdad, con estado `simulado` y el costo que habría tenido. Revisa esas filas
con el dueño de la barbería: si hay alguien ahí que no debería recibir el mensaje, ajusta
umbrales antes de gastar nada.

El nodo `Seleccionar dormidos` deja además un resumen en el log de la ejecución:

```
por_negocio=[{"negocio_id":"brb001","candidatos":37,"elegidos":37,"frenados_por_tope":0,"costo_estimado_usd":1.1285}]
descartes={"aun_activo":214,"optout":8,"ya_tiene_cita":11,"demasiado_frio":52}
```

Eso responde la pregunta de "¿por qué hoy solo salieron 3?" sin abrir nada más.

Cuando esté bien, pon `modo_prueba` en `no` y activa el cron.

---

## Cómo funciona

### Workflow 01 · Reactivación (cron diario, 10:00 hora local)

Lee las cuatro hojas, y en un solo nodo de código decide a quién escribir. Un cliente entra
solo si pasa **todas** estas:

| Regla | Por qué |
|---|---|
| `optout` no es `si` | Obvio, y es obligación legal |
| Teléfono con 10 dígitos o más | Evita quemar envíos en basura |
| Días desde la última visita ≥ `umbral_dias` (45) | Antes de eso todavía no está dormido |
| Días desde la última visita ≤ `umbral_max_dias` (120) | Más allá la recuperación se desploma; seguir es quemar presupuesto |
| Sin cita futura agendada | Escribirle es contraproducente |
| Sin contacto en los últimos `cooldown_dias` (60) | Reconstruido desde el log, no desde la ficha |
| El negocio abre hoy (`dias_habiles`) | Nadie contesta un domingo si el local cierra |

Los que pasan se ordenan **de menos a más tiempo dormidos** — los más recuperables primero — y
se corta en `max_por_dia`. El envío va por lotes de `tam_lote` con `espera_entre_lotes_seg`
entre uno y otro, y cada llamada reintenta hasta 3 veces.

Al final, una fila en `resumen_diario` y, si hubo envíos, un WhatsApp al dueño.

### Workflow 02 · Respuestas (webhook)

Recibe dos clases de evento y los separa:

- **Mensajes.** Identifica al cliente, deduce la intención (por el payload del botón, o
  interpretando texto libre si escribió a mano), actualiza su ficha, le contesta —gratis,
  porque acaba de escribir y eso abre la ventana de 24 h— y avisa al dueño si quiere agendar.
- **Acuses de entrega.** Aquí llega el único dato de costo que no es estimación: Meta dice si
  el mensaje fue facturable y en qué categoría lo clasificó **ella**. Se escribe sobre la fila
  del log con ese `wamid`.

Un detalle que rompe esto en silencio si no se contempla: **WhatsApp no siempre devuelve el
número como se envió**. En México quita o pone un `1` tras el `52` (`5215511111111` sale,
`525511111111` vuelve), y en Argentina hace lo mismo con el `9`. El workflow genera las
variantes y busca por todas; sin eso, ninguna respuesta mexicana se identifica.

### Workflow 03 · Errores

Un solo Error Workflow para los otros dos. Clasifica el fallo en tres:

- **Transitorio** (red, rate limit): se registra y ya. Se arregla solo.
- **Revisar**: registra y avisa.
- **Crítico** (token caducado, credenciales): registra y avisa marcado en rojo. El servicio
  está caído hasta que alguien actúe.

La alerta va al operador por Telegram. **Nunca al cliente.**

---

## Dar de alta una barbería nueva

1. Añade una fila en `negocios`. Con los valores por defecto (45 / 120 / 60 / 40) se empieza
   bien; se afinan después con datos reales.
2. Importa su base de clientes a `clientes` con `negocio_id` correcto y `cliente_id` único.
3. Da de alta su número en la Cloud API y pega el `phone_number_id` en su fila.
4. Aprueba las tres plantillas para ese WABA.
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
| `umbral_max_dias` | 120 | La base es chica y quieres alcance | Estás gastando en gente irrecuperable |
| `cooldown_dias` | 60 | Recibes quejas de insistencia | Nunca; 60 ya es agresivo |
| `max_por_dia` | 40 | El dueño da abasto con las respuestas | Se le juntan más citas de las que puede atender |

El tope diario existe por una razón que no es técnica: si mandas 400 mensajes de golpe y
responden 60, la barbería no da abasto, la experiencia es mala y el dueño culpa al sistema.

---

## Qué mirar cada semana

Todo sale de `log_mensajes`:

- **Tasa de respuesta** = filas `tipo=respuesta` ÷ filas `tipo=reactivacion` enviadas.
- **Tasa de recuperación** = clientes con `agendo=si` ÷ enviados. Es el número que vende.
- **Costo real** = suma de `costo_estimado_usd` donde `facturable=si`.
- **Bajas** = respuestas con intención de baja. Si sube, el mensaje o la lista están mal.
- Filas con `accion=avisar_operador`: son las que necesitan un humano hoy.

Para la conversación de venta, la cuenta se hace con los números del cliente, no con los
tuyos: cuántos clientes tiene con más de 45 días sin venir, cuánto vale un corte, y cuántos de
esos recuperó el primer mes. Ese primer número casi siempre lo deja frío, porque nadie lo ha
mirado nunca.

---

## Cuando algo falla

| Síntoma | Causa casi segura |
|---|---|
| Todos los envíos dan `132001` | La plantilla no está aprobada en ese idioma, o el nombre de la hoja no coincide |
| `132000` | El número de parámetros de la plantilla no coincide con los que manda el workflow |
| `190` en todo | El token de Meta caducó. Usa uno permanente de System User, no uno temporal |
| `131026` en un número | Ese teléfono no tiene WhatsApp. Márcalo y sácalo de la lista |
| `131049` / `130472` sueltos | Meta topó el marketing de ese usuario. No es tuyo, se reintenta |
| Se envía pero no llega nada | Falta suscribirse a `message_status` en el webhook |
| Las respuestas no identifican al cliente | El `cliente_id` no es único, o el teléfono de la hoja tiene formato raro |
| El webhook no verifica | El verify token del nodo IF no coincide con el de Meta |
| No selecciona a nadie | Mira `descartes=` en el log de ejecución. Suele ser `hoy_no_abre` o `en_cooldown` |

---

## Lo que esto no hace

Para que no se venda de más:

- **No agenda citas.** Avisa al dueño y él cierra. Agendar en automático exige integrarse con
  su calendario y ahí cada barbería es un mundo.
- **No cobra ni gestiona pagos.**
- **No sustituye a Booksy ni a Fresha.** Se pone encima.
- **No importa clientes solo.** La primera carga de `clientes` es manual o exportada desde su
  sistema.
- **No adivina texto libre complicado.** Si alguien pregunta el precio, lo marca `otro` y lo
  pasa a un humano, a propósito.

---

## Archivos

```
automatizaciones/barberia/
├── README.md                          este documento
├── plantillas-whatsapp.md             textos exactos para aprobar en Meta
├── hojas/                             CSVs para importar como pestañas
│   ├── negocios.csv
│   ├── clientes.csv
│   ├── log_mensajes.csv
│   ├── tarifas.csv
│   ├── resumen_diario.csv
│   └── errores.csv
├── workflows/                         JSON para importar en n8n
│   ├── 01-reactivacion-dormidos.json  22 nodos · cron diario
│   ├── 02-respuestas-whatsapp.json    22 nodos · webhook
│   └── 03-manejador-errores.json       7 nodos · error trigger
└── pruebas/                           regresión, solo node, sin dependencias
    └── ejecutar.sh
```

Los tres JSON se versionan aquí a propósito. El editor visual de n8n invita a tocar en
producción y romper cosas sin historial; si cambias algo, exporta y commitea. Ese repositorio
de plantillas es lo que hace que la barbería número 12 te cueste dos horas en vez de dos
semanas.

### Pruebas

```bash
./automatizaciones/barberia/pruebas/ejecutar.sh
```

Cinco suites que corren la lógica de los nodos Code fuera de n8n, con sobres reales de la
Cloud API y las hojas de ejemplo como datos: sintaxis, coherencia entre workflows y hojas,
reglas de selección, clasificación de errores de la API, e interpretación de respuestas.

**Córrelas cada vez que exportes un workflow desde n8n.** El editor no avisa si renombras una
columna o rompes una expresión, y estos fallos aparecen en producción a las 10:00 del día
siguiente, sobre dinero real.
