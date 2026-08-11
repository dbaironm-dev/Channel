# Character sheets — producción y resultados

Registro de la generación de los sheets base del canal. Estas 6 imágenes son los **assets
maestros**: se reutilizan como referencia en los 33 keyframes del episodio 01 y en todos los
episodios siguientes.

- **Modelo usado (drafts):** `z_image` — 0.15 créditos/imagen
- **Fecha:** 2026-08-11
- **Costo total del lote:** 0.9 créditos (6 imágenes)
- **Aspect ratio:** 16:9 · 2048×1152

---

## Estructura de prompt aplicada

Los prompts siguen la arquitectura de slots del workflow `character-sheet` de Higgsfield, que
es más estricta que una descripción libre y da mucha mejor consistencia entre vistas:

```
[COMPOSICIÓN] → [identidad idéntica en todas las vistas] → [fondo seamless]
→ CHARACTER: [identidad, cara, ojos, pelo, cuerpo, vestuario completo de pies a cabeza]
→ RENDER:    [módulo del preset 3d-stylized]
→ LIGHTING:  [iluminación]
→ QUALITY:   [cola de calidad]
→ [cola negativa]
```

Reglas que importan y que hay que mantener al iterar:

1. **Vestuario completo de arriba a abajo.** Top → capas → bottom → zapatos → accesorios.
   Sin huecos: si no lleva algo, dilo explícitamente.
2. **Especificidad sobre adjetivos.** "vestido teal con lunares blancos pequeños y mangas
   abullonadas" ≫ "vestido bonito".
3. **Al iterar, arrastra todos los detalles ya establecidos.** Cambia solo lo que pediste y
   vuelve a escribir el resto, o el personaje deriva sin que te des cuenta.
4. **Personajes originales.** Nunca describir un parecido con una persona real ni con un
   personaje de una propiedad existente.
5. **Para Mamá:** hay que forzar estructura facial adulta (`defined adult jawline`,
   `mature adult facial proportions`, negativo `no babyface`). Los modelos tienden a
   infantilizar a los adultos en estilo cartoon si no se los frena.

---

## CS-01 — Beni

```
Character turnaround model sheet, four consistent full-body views in a row - front view, 3/4
view, side profile, and back view, evenly spaced, identical original toddler boy character on
all views, standing upright in a neutral pose with arms relaxed, full head-to-toe framing,
plain light mint seamless background, professional character sheet presentation.
CHARACTER: toddler boy 18 months old, oversized round head, huge glossy dark brown eyes with
soft catchlights, three small tufts of soft black hair, warm light tan skin, chubby cheeks,
tiny button nose, wide open smile showing two bottom teeth, short chubby arms and legs, wearing
a mustard yellow onesie with a small white star on the chest and soft white socks.
RENDER: stylized 3D character render for preschool animation, appealing exaggerated cartoon
proportions, smooth matte plastic surfaces with gentle subsurface scattering, soft rounded
features, pastel saturated palette of mint coral butter yellow and sky blue.
LIGHTING: soft global illumination, three-point studio lighting, gentle rim light, no harsh
shadows.
QUALITY: high-end 3D animation studio quality, clean neutral background, 4K, sharp.
Original character. No text, no watermark, no logos, no frame borders, no extra characters,
no background props, no harsh shadows, no distorted anatomy, no extra fingers, no
photorealistic skin, no dark tones, no scary expression.
```

`job_id: 49585e5f-b0e5-469d-8448-e8c0499265d7`

## CS-02 — Lila

Igual que CS-01, cambiando el bloque CHARACTER por:

```
CHARACTER: girl 5 years old, big round head, large hazel eyes with soft catchlights, curly dark
brown hair styled in two puff buns tied with teal scrunchies, medium tan skin, light freckles
across the nose, cheerful open smile, slim child proportions, wearing a teal dress with small
white polka dots, short puff sleeves, and coral sneakers with white laces.
```

`job_id: 744e1b95-1670-4e2e-9a1c-23663a30712a`

## CS-03 — Mamá

```
CHARACTER: woman in her early thirties, warm brown skin, shoulder-length wavy black hair tied
back in a low ponytail with soft strands framing the face, gentle rounded face with defined
adult jawline and cheekbones and mature adult facial proportions, warm dark eyes, soft calm
smile, small gold hoop earrings, wearing a coral long-sleeve top and rolled-up blue jeans with
simple white slip-on shoes.
RENDER: ... appealing cartoon proportions with a slightly oversized head, ...
```

Negativos extra: `no babyface, no overly youthful rounded proportions`, más
`Original character, does not resemble any real person`.

`job_id: 969af31b-77a5-492e-bdbb-fb0cc00c6f13`

## CS-04 — Choco

```
Character turnaround model sheet, four consistent full-body views in a row - front view, 3/4
view, side profile, and back view, evenly spaced, identical original cartoon dog character on
all views, standing on all four legs in a neutral pose, full body framing, plain light mint
seamless background, professional character sheet presentation.
CHARACTER: small round cartoon pet dog, caramel brown fur with a cream muzzle and cream chest
patch, long floppy ears, oversized round black eyes with bright catchlights, small black button
nose, stubby short legs, short upturned tail, wearing a mint green collar with a small yellow
bone-shaped tag, friendly happy expression with tongue slightly out.
RENDER / LIGHTING / QUALITY: igual que CS-01, con "smooth soft fur shading".
Negativos: ... no photorealistic fur, no dark tones, no scary expression.
```

`job_id: 9100388a-6f9d-4d14-8b9c-d03f300c953f`

## CS-05 — Patito (prop sheet)

```
Prop model sheet, four consistent views of the same object in a row - front view, 3/4 view,
side profile, and back view, evenly spaced, identical original toy prop on all views, plain
light mint seamless background, professional prop sheet presentation.
OBJECT: classic rubber duck bath toy, glossy bright butter yellow body, rounded chunky friendly
shape, small orange beak, single painted black dot eye on each side, flat bottom, slightly
oversized cartoon proportions.
RENDER: stylized 3D render for preschool animation, smooth matte-to-satin plastic surface, soft
rounded forms, pastel saturated palette.
LIGHTING / QUALITY: igual que los demás.
No text, no watermark, no logos, no frame borders, no characters, no background props, no harsh
shadows, no photorealistic reflections.
```

`job_id: 53eaaefe-9113-4131-b828-7fd3c423fdd1`

## CS-06 — Set del baño

```
Wide establishing interior shot of a bright cheerful cartoon family bathroom, empty with no
people and no animals. White subway tile walls with a mint green accent stripe at mid height,
a round white bathtub with a chrome faucet on the right, a small wooden stool with folded coral
towels beside it, a white sink with a fogged mirror above it on the left, one window with sheer
white curtains letting in warm afternoon light, a woven basket of bath toys on the floor, light
wooden floor, a coral bath mat.
RENDER: stylized 3D environment render for preschool animation, smooth matte plastic surfaces,
soft rounded shapes, clean and uncluttered, pastel saturated palette of mint coral butter
yellow and sky blue.
LIGHTING: soft global illumination, warm window light, no harsh shadows.
CAMERA: eye-level at toddler height, wide angle.
QUALITY: high-end 3D animation studio quality, 4K, sharp.
No text, no watermark, no logos, no people, no characters, no clutter, no dark tones, no
photorealistic textures.
```

`job_id: 82776b76-12b0-4920-b34c-a702febf06ca`

---

## Qué revisar en los drafts

Checklist antes de dar por buenos los sheets (en este orden de importancia):

- [ ] **Las 4 vistas son el mismo personaje.** Si la cara cambia entre vistas, el sheet no
      sirve como referencia. Es el fallo más común.
- [ ] **Cuerpo completo, de pie, sin recortar.** Pies visibles en las 4 vistas.
- [ ] **Un solo personaje por imagen**, sin figuras duplicadas ni maniquíes.
- [ ] **Proporciones correctas:** cabezas grandes en los niños; Mamá adulta, no infantilizada.
- [ ] **Paleta consistente** entre los 6 assets (mint / coral / amarillo mantequilla / azul).
- [ ] **Vestuario exacto** al descrito: la estrella blanca en el pijama de Beni, los lunares de
      Lila, el collar mint de Choco.

Si algo falla, la corrección es **reescribir el prompt entero con el detalle corregido**, no
pedir un ajuste incremental — arrastra todos los demás detalles o el personaje deriva.

---

## Presupuesto y siguiente paso

| Concepto | Modelo | Costo |
|---|---|---|
| 6 sheets draft (hecho) | `z_image` | 0.9 créditos |
| 6 sheets finales | `nano_banana_pro` @ 1k | 12 créditos |
| 33 keyframes del episodio | `nano_banana_pro` @ 1k | 66 créditos |
| 33 clips de video | Seedance 2.0 | a presupuestar |

**Saldo actual: 9.1 créditos (plan free).** Alcanza para 4 sheets finales en
`nano_banana_pro`, no para los 6, y no queda nada para keyframes.

Orden recomendado:

1. Revisar los drafts y cerrar el diseño de los personajes (gratis, solo criterio).
2. Recargar créditos.
3. Regenerar los 6 sheets en `nano_banana_pro` con los prompts ya validados.
4. Producir los 33 keyframes pasando los sheets como referencia de personaje.
5. Animar en Seedance 2.0 con los prompts de `guion-episodio-01.md`.

Hacer el paso 1 antes de gastar es lo que evita pagar dos veces por los 33 keyframes.
