/**
 * Calibration du détecteur de contours sur l'image elle-même.
 *
 * Le réglage exposé n'est pas un seuil mais une **proportion d'image encrée**, et
 * c'est le fond du sujet : la magnitude du gradient ne se compare pas d'une image à
 * l'autre. Mesuré sur le même shader, un seuil de 0,38 laisse passer **0,01 %** d'une
 * photographie et **5,16 %** d'un dessin au trait — deux ordres de grandeur. Aucune
 * valeur fixe ne peut servir les deux ; la proportion, si.
 *
 * Le seuil absolu s'en déduit par le quantile correspondant, calculé sur l'image
 * ouverte.
 */

/**
 * Un point de mesure tous les `SAMPLE_STEP` pixels, **sur l'image à sa définition
 * de rendu**.
 *
 * On échantillonne, on ne réduit pas : la magnitude d'un Sobel est une différence
 * entre pixels **voisins**, donc elle dépend de la définition. Sur une vignette de
 * 512 px, chaque pixel couvre quatre fois plus de scène et les gradients sont
 * environ quatre fois plus grands qu'à 2000 px. Mesuré sur une photographie, le
 * seuil calibré sur la vignette laissait 3,96 % d'encre à sa propre échelle et
 * **0,56 % à celle du rendu** — le calque restait vide.
 *
 * L'échantillonnage garde les voisins immédiats de la pleine définition, donc les
 * bonnes unités, pour le coût d'une vignette : 1 pixel sur 16.
 */
export const SAMPLE_STEP = 4

/**
 * Luminance perceptuelle, coefficients Rec. 709.
 *
 * **Doit rester identique à `luma()` dans `traceShader.ts`.** Les deux calculent la
 * même chose de part et d'autre du GPU : une divergence décalerait silencieusement
 * la calibration par rapport à ce qui est réellement dessiné.
 */
export const lumaFrom = (rgba: Uint8ClampedArray): Float32Array => {
  const gray = new Float32Array(rgba.length / 4)

  for (let i = 0; i < gray.length; i++) {
    gray[i] = (0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!) / 255
  }

  return gray
}

/**
 * Magnitudes de Sobel, **triées croissant** — la forme dont `thresholdForRatio` a
 * besoin, et le tri se paie une seule fois.
 *
 * Noyau 3×3 et normalisation `/4` repris **à l'identique** du fragment shader
 * (`traceShader.ts`, branche `uMode == 1`). Les bords sont ignorés, comme dans le
 * shader où `CLAMP_TO_EDGE` les rend de toute façon peu significatifs.
 */
export const sobelMagnitudes = (
  gray: Float32Array,
  w: number,
  h: number,
  step = 1,
): Float32Array => {
  if (w < 3 || h < 3) return new Float32Array(0)

  const cols = Math.ceil((w - 2) / step)
  const rows = Math.ceil((h - 2) / step)
  const out = new Float32Array(cols * rows)
  let k = 0

  /* `step` espace les points de **mesure**, jamais les voisins : le noyau lit
     toujours les pixels immédiatement adjacents, donc les magnitudes gardent
     l'échelle de la définition de rendu. Sous-échantillonner l'image au lieu du
     tirage fausserait les unités. */
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const tl = gray[(y - 1) * w + x - 1]!
      const tm = gray[(y - 1) * w + x]!
      const tr = gray[(y - 1) * w + x + 1]!
      const ml = gray[y * w + x - 1]!
      const mr = gray[y * w + x + 1]!
      const bl = gray[(y + 1) * w + x - 1]!
      const bm = gray[(y + 1) * w + x]!
      const br = gray[(y + 1) * w + x + 1]!

      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl)
      const gy = (bl + 2 * bm + br) - (tl + 2 * tm + tr)

      out[k++] = Math.min(1, Math.hypot(gx, gy) / 4)
    }
  }

  // `subarray` et non `slice` : le tableau est dimensionné au plus juste, mais un
  // arrondi de `ceil` peut laisser une queue de zéros qui fausserait les quantiles.
  return out.subarray(0, k).sort()
}

/** Part de `inkRatio` qui reçoit un trait **pleinement** opaque. */
const FULL_INK_SHARE = 0.25

export interface EdgeRamp {
  /** Magnitude à partir de laquelle le trait commence à apparaître. */
  start: number
  /** Magnitude à partir de laquelle il est pleinement opaque. */
  full: number
}

/**
 * Le seuil qui laisse passer `ratio` de l'image.
 */
export const thresholdForRatio = (sorted: Float32Array, ratio: number): number => {
  // Image uniforme, ou trop petite pour un noyau 3×3 : aucun contour à seuiller.
  if (!sorted.length) return 0

  const clamped = Math.min(1, Math.max(0, ratio))

  /* `n - ceil(ratio × n)` et non la formule de centile `(1 - ratio) × (n - 1)` : la
     seconde décale d'un rang, parce qu'on ne cherche pas la valeur *à* un centile
     mais celle qui laisse **exactement** `ratio × n` magnitudes au-dessus d'elle.
     Sur cent valeurs et 10 %, elle rendait le 89ᵉ rang, donc 11 % d'encre. */
  const index = sorted.length - Math.ceil(clamped * sorted.length)

  // `ratio` nul ramène au maximum : un seul pixel encré, le minimum atteignable
  // avec un seuil pris dans l'échantillon.
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]!
}

/**
 * Les deux bornes de la rampe d'encrage, toutes deux **dérivées de l'image**.
 *
 * La rampe doit suivre la distribution au même titre que le seuil. Elle était fixée
 * à `start + 0,08`, dans les mêmes unités arbitraires que l'ancien seuil : sur une
 * photographie dont le 99ᵉ centile vaut 0,14, l'opacité pleine n'était atteinte
 * qu'au-delà du centile le plus haut, et les 8 % de pixels franchissant le seuil
 * recevaient un alpha quasi nul. Le calque paraissait vide **alors que le seuil,
 * lui, était juste** — deux bugs superposés dans les mêmes fausses unités.
 */
export const edgeRamp = (sorted: Float32Array, ratio: number): EdgeRamp => {
  const start = thresholdForRatio(sorted, ratio)
  const full = thresholdForRatio(sorted, ratio * FULL_INK_SHARE)

  /* Distribution plate — un aplat, ou une image à deux niveaux : les deux quantiles
     se confondent et `smoothstep(a, a, x)` divise par zéro. L'écart minimal rend
     alors un seuil franc, ce qui est le comportement correct dans ce cas. */
  return { start, full: Math.max(full, start + 1e-4) }
}
