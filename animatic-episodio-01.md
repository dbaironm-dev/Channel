# Animatic episodio 01 — resultados y hallazgos de producción

Prueba completa del capítulo "¡Splash, Beni!": los 33 keyframes generados.

- **Modelo:** `z_image` (0.15 créditos/imagen), 16:9, 2048×1152
- **Fecha:** 2026-08-11
- **Resultado:** 33/33 planos completados

---

## Hallazgo crítico: el filtro NSFW bloquea escenas de baño

**Tres planos fueron rechazados por el filtro de seguridad**, todos por el mismo motivo: un
bebé en la bañera. Esto no es un detalle técnico, es una restricción de diseño que afecta a
todo el canal.

| Plano | Encuadre original | Resultado |
|---|---|---|
| P10 | Pies descalzos del bebé pateando bajo el agua, vista subacuática | Bloqueado |
| P13 | Plano general: Lila sopla espuma hacia Beni en la bañera | Bloqueado 3 veces |
| P9 | Bebé sentado en la bañera golpeando el agua | Bloqueado, luego aprobado |

### Qué dispara el filtro

- Piel desnuda de un menor visible, aunque sea solo pies o torso.
- Vistas subacuáticas o desde abajo del nivel del agua.
- Plano general que muestra al bebé desnudo en la bañera **junto a otra persona**.

### Las tres soluciones que funcionaron

Ordenadas de menos a más invasiva. Aplica la primera que resuelva el plano.

**1. Cobertura de espuma explícita.** Describe la bañera llena hasta el borde y al personaje
cubierto, no solo presente en el agua:

> `a bathtub filled to the brim with thick fluffy white foam, only his head and foam-covered
> shoulders visible`

Añade también `wholesome family animation` al bloque de estilo. Esto rescató P9, P17, P19,
P21, P23 y todos los planos de bañera que siguieron.

**2. Sacar al personaje del cuadro.** Si el plano insiste en fallar, reencuádralo sobre otro
sujeto. P13 pasó de plano general a **POV desde dentro de la bañera**: Lila sopla hacia
cámara, el bebé no aparece. Mismo beat narrativo, cero riesgo.

**3. Plano de objeto.** Para planos de detalle, quita a la persona por completo. P10 pasó de
"pies pateando bajo el agua" a "la superficie del agua agitándose desde abajo, sin personas
en cuadro". Se lee igual en el montaje y no hay nada que filtrar.

### Consecuencia para el plan de la serie

De los 6 episodios propuestos, **el de baño es el más hostil de producir**. Si vas a hacer
más capítulos, prioriza rutinas sin desnudez: dientes, comida, guardar juguetes, vestirse y
dormir no tienen este problema. Un canal entero de rutinas de baño va a pelear con el filtro
en cada plano.

---

## Segundo hallazgo: rate limiting

`z_image` rechazó envíos con `429 rate_limit_reached` de forma constante. Máximo real
observado: **3 a 4 imágenes por envío**, no las 12 que admite el batch. Producir 33 planos
requirió 9 rondas de envío con esperas intermedias.

Para planificar: un capítulo de 33 planos toma unas 10 rondas, no una. Si automatizas esto,
mete reintento con backoff en vez de asumir que el batch entra completo.

---

## Tercer hallazgo: consistencia sin referencia de imagen

`z_image` **no acepta imágenes de referencia** (su campo `medias` está vacío). Los character
sheets no se pudieron usar como referencia — la única defensa contra la deriva fue incrustar
la descripción completa del personaje en los 33 prompts.

Es un parche, no una solución. Para producción real hay que usar un modelo con soporte de
referencia:

| Modelo | Referencia de imagen | Costo |
|---|---|---|
| `z_image` | No | 0.15 |
| `nano_banana_pro` | Sí (rol `image`) | 2 (1k) |
| `soul_2` | Sí | — |

Al pasar a `nano_banana_pro`, adjunta el sheet del personaje en cada keyframe. Ahí sí la cara
se mantiene entre planos y el animatic se convierte en material usable.

---

## Cuarto hallazgo: Seedance es 2.5, no 2.0

La versión disponible es **Seedance 2.5** (Bytedance). Los prompts del guion sirven sin
cambios. Parámetros reales:

- `mode`: `t2v`, `omni_reference`, `video_edit`, `video_extension`
- `duration`: 4–30 s
- `resolution`: 480p o 720p
- `generate_audio`: true/false
- `medias` roles: `start_image`, `end_image`, `image_references`, `video_references`,
  `audio_references`

Para el flujo del guion, lo correcto es `start_image` con el keyframe.

---

## Costos reales de video (medidos)

| Modelo | Config | Costo |
|---|---|---|
| Kling 3.0 Turbo | 5 s, 720p | 7.5 |
| **Seedance 2.5** | 5 s, 480p, sin audio | **15** |
| **Seedance 2.5** | 5 s, 720p, con audio | **32.5** |

**Un capítulo de 33 planos animado en Seedance 2.5:**

- 480p sin audio: **495 créditos**
- 720p con audio: **1.072 créditos**

Más los keyframes: 66 créditos en `nano_banana_pro`, más 12 de los sheets finales.

**Total realista de un capítulo terminado: entre 573 y 1.150 créditos.**

Kling 3.0 Turbo a 7.5 baja el video a 247 créditos. Vale la pena probar un plano en cada
modelo y comparar antes de comprometer el presupuesto de un capítulo entero.

---

## Qué revisar en el animatic

- [ ] **Ritmo.** Pasa los 33 planos a 3 s cada uno y mira si la historia se sostiene.
- [ ] **Deriva de personaje.** Compara P3, P15 y P32 (los tres primeros planos de Beni). Si
      las caras no coinciden, es el problema esperado de generar sin referencia.
- [ ] **Continuidad del set.** El baño debería ser reconocible entre P4, P17 y P23.
- [ ] **Los tres planos rescatados** (P9, P10, P13): confirma que el reencuadre no rompe la
      lectura de la escena en el montaje.
- [ ] **P33.** Verifica que quedó espacio limpio al centro para el logo.
