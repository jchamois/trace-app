/**
 * La chaîne tonale — l'unique propriétaire de « comment un pixel devient une
 * valeur avant d'être un trait ».
 *
 * Elle existait en deux exemplaires : une en GLSL dans le shader, une en
 * TypeScript pour la calibration, tenues d'accord par des commentaires. Les
 * commentaires ont protégé les **coefficients**, qui n'allaient jamais casser, et
 * donné une fausse confiance sur **l'ordre des opérations**, qui a cassé : le
 * shader mesurait `luma(grade(...))` pendant que la calibration mesurait `luma()`
 * seul. Aux valeurs par défaut `grade` est l'identité, donc les deux coïncidaient
 * — et pousser le curseur Contraste multipliait les gradients du shader par trois
 * pendant que le seuil décrivait toujours l'autre distribution.
 *
 * Les deux implémentations vivent désormais **côte à côte dans ce fichier**, et
 * `tests/tone.spec.ts` les confronte l'une à l'autre à travers un vrai contexte
 * WebGL. Un seam qu'on peut exécuter, au lieu d'un commentaire.
 */

export interface ToneParams {
  contrast: number
  gamma: number
  invert: boolean
}

/** Rec. 709. Une seule déclaration, reprise mot pour mot dans `TONE_GLSL`. */
export const LUMA_COEFFS = [0.2126, 0.7152, 0.0722] as const

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Étalonnage d'une **luminance**, gamma puis contraste puis inversion.
 *
 * Le shader étalonne par canal pour le rendu « Photo », où la couleur compte. Pour
 * les contours et les aplats il étalonne la luminance, comme ici : c'est ce qui
 * permet à la mesure CPU de n'avoir besoin que d'un `Float32Array` de luminances
 * plutôt que du RGB pleine définition, et de vérifier l'accord sur des scalaires.
 */
export const gradeTone = (v: number, { gamma, contrast, invert }: ToneParams): number => {
  const gammaed = clamp01(v) ** (1 / gamma)
  const contrasted = clamp01((gammaed - 0.5) * (1 + contrast) + 0.5)

  return invert ? 1 - contrasted : contrasted
}

/** Luminance brute d'un tampon RGBA, sans étalonnage. */
export const lumaFrom = (rgba: Uint8ClampedArray): Float32Array => {
  const [r, g, b] = LUMA_COEFFS
  const out = new Float32Array(rgba.length / 4)

  for (let i = 0; i < out.length; i++) {
    out[i] = (r * rgba[i * 4]! + g * rgba[i * 4 + 1]! + b * rgba[i * 4 + 2]!) / 255
  }

  return out
}

/**
 * Applique l'étalonnage à un tampon de luminances.
 *
 * Séparé de `lumaFrom` parce que la luminance brute se calcule **une fois** — elle
 * ne dépend pas des réglages — alors que l'étalonnage se recalcule à chaque
 * mouvement de curseur.
 */
export const applyTone = (luma: Float32Array, params: ToneParams): Float32Array => {
  const out = new Float32Array(luma.length)

  for (let i = 0; i < luma.length; i++) out[i] = gradeTone(luma[i]!, params)

  return out
}

/**
 * Le même calcul, en GLSL, injecté dans le fragment shader.
 *
 * Toute modification ici doit être reportée dans `gradeTone` ci-dessus — et
 * `tests/tone.spec.ts` échoue si ce n'est pas fait. C'est la seule garantie qui
 * vaille : les deux fonctions sont comparées numériquement, pas relues.
 *
 * `uGamma`, `uContrast` et `uInvert` sont fournis par `traceShader.ts`.
 */
export const TONE_GLSL = `
float luma(vec3 c) {
  return dot(c, vec3(${LUMA_COEFFS[0]}, ${LUMA_COEFFS[1]}, ${LUMA_COEFFS[2]}));
}

// Miroir exact de gradeTone() dans utils/tone.ts.
float gradeTone(float v) {
  float g = pow(clamp(v, 0.0, 1.0), 1.0 / uGamma);
  g = clamp((g - 0.5) * (1.0 + uContrast) + 0.5, 0.0, 1.0);
  return mix(g, 1.0 - g, uInvert);
}

// Rendu « Photo » : la couleur compte, l'étalonnage s'applique par canal.
vec3 gradeColor(vec3 c) {
  vec3 g = pow(clamp(c, 0.0, 1.0), vec3(1.0 / uGamma));
  g = clamp((g - 0.5) * (1.0 + uContrast) + 0.5, 0.0, 1.0);
  return mix(g, 1.0 - g, uInvert);
}
`
