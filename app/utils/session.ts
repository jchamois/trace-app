/**
 * Le modèle d'un tracé. Partagé par la persistance, l'archive et le rendu — il n'y
 * a qu'une définition, et c'est ici.
 */
import type { Pt } from './homography'
import type { Corners } from './overlay'

export type PaperFormat = 'A3' | 'A4' | 'A5' | 'notebook' | 'free'
export type RenderMode = 'photo' | 'edges' | 'posterize'
export type AlignMode = 'simple' | 'quad'

export interface RenderParams {
  /** 0 → 1. Le calque doit laisser voir la feuille : jamais 1 par défaut. */
  opacity: number
  contrast: number
  gamma: number
  /**
   * Part de l'image à encrer en rendu « Contours », de 0 à 1 — **et non un seuil**.
   *
   * La magnitude d'un gradient ne se compare pas d'une image à l'autre : mesuré sur
   * le même shader, un seuil de 0,38 encrait 0,01 % d'une photographie et 5,16 %
   * d'un dessin au trait. La proportion, elle, est stable ; le seuil absolu s'en
   * déduit par le quantile de l'image ouverte (`utils/edgeStats.ts`).
   */
  inkRatio: number
  /** Nombre de paliers en rendu « Aplats ». */
  levels: number
}

export interface TraceSession {
  id: string
  name: string
  createdAt: number
  updatedAt: number

  /** La photo, telle qu'importée après redimensionnement. Ne quitte pas l'appareil. */
  image: Blob
  thumb: Blob

  /**
   * Les quatre coins de la feuille, **normalisés** sur le viewport caméra.
   * `null` tant que le tracé n'a jamais été calé.
   *
   * On stocke les coins et jamais la matrice : la matrice se dérive en un calcul,
   * alors qu'exprimée en pixels écran elle deviendrait fausse à la première
   * rotation portrait ↔ paysage, au premier changement de définition du flux ou au
   * premier redimensionnement.
   *
   * `null` plutôt qu'un rectangle arbitraire posé à la création : le calage par
   * défaut dépend des **proportions du viewport**, qu'on ne connaît qu'une fois
   * l'écran de travail monté. Un défaut calculé trop tôt donnerait une feuille
   * déformée, et l'image avec elle.
   */
  corners: Corners | null
  mode: AlignMode

  paperFormat: PaperFormat
  /** Dérivé du format, sauf en « Libre » où l'utilisateur le saisit. */
  paperSizeCm: { w: number, h: number }
  /** Largeur voulue du sujet sur le papier ; `null` = l'image remplit la feuille. */
  targetWidthCm: number | null

  render: RenderMode
  params: RenderParams
  invert: boolean
  strokeColor: string
}

/** Format, en centimètres. Le carnet vise un A5 à l'italienne courant. */
export const PAPER_SIZES: Record<Exclude<PaperFormat, 'free'>, { w: number, h: number }> = {
  A3: { w: 29.7, h: 42 },
  A4: { w: 21, h: 29.7 },
  A5: { w: 14.8, h: 21 },
  notebook: { w: 21, h: 14.8 },
}

export const PAPER_LABELS: Record<PaperFormat, string> = {
  A3: 'A3',
  A4: 'A4',
  A5: 'A5',
  notebook: 'Carnet',
  free: 'Libre',
}

/** Les quatre couleurs du handoff. Le blanc sert sur papier sombre. */
export const STROKE_COLORS = ['#111114', '#FFFFFF', '#6E56F8', '#3B82F6'] as const

export const DEFAULT_PARAMS: RenderParams = {
  opacity: 0.42,
  contrast: 0,
  gamma: 1,
  // 8 % : assez de trait pour décalquer un visage ou une architecture, assez peu
  // pour que le grain de la photo ne remonte pas en semis de points.
  inkRatio: 0.08,
  levels: 4,
}

/** Part du viewport occupée par la feuille par défaut, sur son côté contraignant. */
const DEFAULT_FILL = 0.84

/**
 * Le calage par défaut : un rectangle centré **aux proportions réelles de la
 * feuille**, inscrit dans le viewport.
 *
 * Le viewport est indispensable au calcul, et c'est le piège de cette fonction :
 * les coins sont normalisés, mais l'écran ne l'est pas. Un rectangle de 0,68 × 0,80
 * en unités normalisées mesure 265 × 675 pixels sur un écran 390 × 844 — un rapport
 * de 0,39 quand un A4 vaut 0,71. L'image héritait de cette déformation et
 * s'affichait étirée en hauteur jusqu'à ce qu'on pose les poignées à la main.
 */
export const defaultCorners = (
  paperRatio: number,
  viewport: { w: number, h: number },
): Corners => {
  let width = viewport.w * DEFAULT_FILL
  let height = width / paperRatio

  // Feuille portrait sur écran portrait : c'est la hauteur qui contraint.
  if (height > viewport.h * DEFAULT_FILL) {
    height = viewport.h * DEFAULT_FILL
    width = height * paperRatio
  }

  const halfW = width / viewport.w / 2
  const halfH = height / viewport.h / 2

  return [
    { x: 0.5 - halfW, y: 0.5 - halfH },
    { x: 0.5 + halfW, y: 0.5 - halfH },
    { x: 0.5 + halfW, y: 0.5 + halfH },
    { x: 0.5 - halfW, y: 0.5 + halfH },
  ]
}

/* ───────────────────────────── Frontières ─────────────────────────────
 *
 * Une session peut entrer par deux chemins, et un seul était gardé :
 *
 * - **une archive ZIP**, écrite par n'importe qui — donc hostile par défaut ;
 * - **IndexedDB**, écrit par une version antérieure de l'application — donc
 *   honnête mais périmé.
 *
 * Les deux ont besoin de la **même connaissance du schéma** et de **politiques
 * opposées** : rejeter bruyamment pour l'archive, réparer en silence pour la base.
 * D'où une seule traversée qui rend la valeur réparée *et* la liste des écarts ;
 * l'appelant choisit quoi en faire.
 *
 * Avant ça, `parseManifest` validait 4 champs sur 15 puis castait le reste. Une
 * archive portant `"params": null` faisait lever un TypeError à **chaque**
 * chargement de la bibliothèque, sans recours depuis l'interface.
 */

/** Une session sans ses blobs : ce que porte le manifeste, et ce qu'on valide. */
export type SessionFields = Omit<TraceSession, 'image' | 'thumb'>

export interface FieldIssue { field: string, reason: string }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isFinitePt = (v: unknown): v is Pt =>
  isObject(v) && Number.isFinite(v.x) && Number.isFinite(v.y)

/** Bornes de chaque réglage. Hors bornes, un `NaN` atteindrait `gl.uniform1f`. */
const PARAM_RANGES: Record<keyof RenderParams, [number, number]> = {
  opacity: [0.05, 1],
  contrast: [-0.9, 2],
  gamma: [0.3, 3],
  inkRatio: [0.01, 0.3],
  levels: [2, 8],
}

const RENDER_MODES: RenderMode[] = ['photo', 'edges', 'posterize']
const ALIGN_MODES: AlignMode[] = ['simple', 'quad']

/**
 * Valide et répare une session en une passe.
 *
 * Ne lève jamais : c'est ce qui permet aux deux frontières de la partager. La
 * politique — rejeter ou accepter la réparation — appartient à l'appelant.
 */
export const collectSession = (
  raw: unknown,
): { value: SessionFields, issues: FieldIssue[] } => {
  const issues: FieldIssue[] = []
  const src = isObject(raw) ? raw : {}
  if (!isObject(raw)) issues.push({ field: '', reason: 'le tracé n’est pas un objet' })

  const take = <T>(field: string, ok: boolean, value: T, fallback: T): T => {
    if (ok) return value
    issues.push({ field, reason: 'absent ou invalide' })

    return fallback
  }

  const now = Date.now()
  const id = take('id', typeof src.id === 'string' && Boolean(src.id), src.id as string, '')
  const name = take('name', typeof src.name === 'string' && Boolean(src.name), src.name as string, 'Sans titre')

  /* `Object.hasOwn` et non l'opérateur `in` : `in` parcourt la chaîne de
     prototypes, donc `'toString' in PAPER_LABELS` vaut vrai. Un format hérité
     passait la validation et arrivait tel quel dans `PAPER_LABELS[format]`, où il
     rendait une fonction. */
  const paperFormat = take(
    'paperFormat',
    typeof src.paperFormat === 'string' && Object.hasOwn(PAPER_LABELS, src.paperFormat),
    src.paperFormat as PaperFormat,
    'A4',
  )

  /* Le repli suit le format déclaré plutôt qu'un A4 en dur : si seul
     `paperSizeCm` est corrompu, on retombe sur des dimensions cohérentes. */
  const fallbackSize = paperFormat === 'free' ? PAPER_SIZES.A4 : PAPER_SIZES[paperFormat]
  const rawSize = src.paperSizeCm
  const paperSizeCm = take(
    'paperSizeCm',
    isObject(rawSize) && Number(rawSize.w) > 0 && Number(rawSize.h) > 0,
    rawSize as { w: number, h: number },
    { ...fallbackSize },
  )

  /* `null` est légitime — un tracé jamais ouvert n'a pas de calage, celui-ci
     dépendant des proportions de l'écran. Un calage douteux se répare donc en
     `null` plutôt qu'en valeurs arbitraires : l'écran de travail le reposera. */
  const rawCorners = src.corners
  const cornersValid = rawCorners === null
    || (Array.isArray(rawCorners) && rawCorners.length === 4 && rawCorners.every(isFinitePt))
  const corners = take(
    'corners',
    cornersValid,
    rawCorners as [Pt, Pt, Pt, Pt] | null,
    null,
  )

  const params = {} as RenderParams
  const rawParams = isObject(src.params) ? src.params : {}
  if (!isObject(src.params)) issues.push({ field: 'params', reason: 'absent ou invalide' })

  for (const key of Object.keys(PARAM_RANGES) as (keyof RenderParams)[]) {
    const [min, max] = PARAM_RANGES[key]
    const v = rawParams[key]
    const ok = typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
    params[key] = take(`params.${key}`, ok, v as number, DEFAULT_PARAMS[key])
  }

  return {
    value: {
      id,
      name,
      createdAt: take('createdAt', Number.isFinite(src.createdAt), src.createdAt as number, now),
      updatedAt: take('updatedAt', Number.isFinite(src.updatedAt), src.updatedAt as number, now),
      corners,
      mode: take('mode', ALIGN_MODES.includes(src.mode as AlignMode), src.mode as AlignMode, 'simple'),
      paperFormat,
      paperSizeCm: { w: paperSizeCm.w, h: paperSizeCm.h },
      targetWidthCm: take(
        'targetWidthCm',
        src.targetWidthCm === null || Number(src.targetWidthCm) > 0,
        src.targetWidthCm as number | null,
        null,
      ),
      render: take('render', RENDER_MODES.includes(src.render as RenderMode), src.render as RenderMode, 'edges'),
      params,
      invert: take('invert', typeof src.invert === 'boolean', src.invert as boolean, false),
      strokeColor: take(
        'strokeColor',
        typeof src.strokeColor === 'string' && /^#[0-9a-f]{6}$/i.test(src.strokeColor),
        src.strokeColor as string,
        STROKE_COLORS[0],
      ),
    },
    issues,
  }
}

export const createSession = (
  { id, name, image, thumb }: { id: string, name: string, image: Blob, thumb: Blob },
): TraceSession => {
  const paperSizeCm = PAPER_SIZES.A4
  const now = Date.now()

  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    image,
    thumb,
    // Calé au premier montage de l'écran de travail, quand le viewport est connu.
    corners: null,
    mode: 'simple',
    paperFormat: 'A4',
    paperSizeCm,
    targetWidthCm: null,
    render: 'edges',
    params: { ...DEFAULT_PARAMS },
    invert: false,
    strokeColor: STROKE_COLORS[0],
  }
}
