import type { Pt } from '~/utils/homography'
import { isDegenerate } from '~/utils/homography'
import type { AlignMode } from '~/utils/session'

export type Corners = [Pt, Pt, Pt, Pt]

/**
 * Rayon de saisie d'une poignée, en pixels CSS. Plus large que le visuel de 36 px :
 * la cible doit faire 48 px pour des doigts couverts de graphite.
 */
const GRAB_RADIUS = 30

export interface TraceGestures {
  /** Index de la poignée en cours de déplacement, pour son état visuel. */
  activeHandle: Ref<number | null>
  /** Un geste est-il en cours ? Sert à masquer l'aide contextuelle. */
  gesturing: Ref<boolean>
}

interface Options {
  surface: Ref<HTMLElement | null>
  corners: Ref<Corners>
  /** Taille du conteneur en pixels CSS : les coins sont stockés normalisés. */
  size: Ref<{ w: number, h: number }>
  mode: Ref<AlignMode>
  /** Verrouille tous les gestes : mode dessin, ou session pas encore chargée. */
  locked: Ref<boolean>
}

const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Les deux modes de calage, sur une seule structure.
 *
 * Le mode « simple » n'est pas un chemin de code séparé : c'est la **même liste de
 * quatre coins**, à laquelle on applique une similitude (translation, échelle,
 * rotation) plutôt que de déplacer un coin isolément. C'est ce qui rend la bascule
 * gratuite — passer au calage 4 coins ne déplace rien à l'écran, ça déverrouille
 * seulement les poignées là où elles se trouvent déjà.
 *
 * Pointer Events exclusivement : ils couvrent doigt, stylet et souris avec une
 * seule implémentation, là où Touch Events laisseraient le développement au clavier
 * et à la souris hors d'atteinte.
 */
export const useTraceGestures = (
  { surface, corners, size, mode, locked }: Options,
): TraceGestures => {
  const activeHandle = ref<number | null>(null)
  const gesturing = ref(false)

  /** Position courante de chaque pointeur actif, en pixels du conteneur. */
  const pointers = new Map<number, Pt>()
  /** Instantané au début du geste à deux doigts. */
  let pinchStart: { a: Pt, b: Pt, corners: Pt[] } | null = null

  const toPixels = (p: Pt): Pt => ({ x: p.x * size.value.w, y: p.y * size.value.h })
  const toNormalized = (p: Pt): Pt => ({ x: p.x / size.value.w, y: p.y / size.value.h })

  const pointOf = (event: PointerEvent): Pt => {
    const rect = surface.value!.getBoundingClientRect()

    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /**
   * N'écrit que si le résultat reste exploitable. Refuser le déplacement plutôt que
   * de rendre un quadrilatère replié est le bon compromis : la poignée « colle » à
   * la limite au lieu de faire disparaître l'image.
   */
  const commit = (next: Corners) => {
    if (isDegenerate(next.map(toPixels) as unknown as Corners)) return

    /* Recopie en littéraux **avant** d'écrire, et ce n'est pas cosmétique : le
       déplacement d'une poignée part d'un `[...corners.value]`, dont les trois
       autres éléments sont des `Proxy` de Vue. IndexedDB inspecte les emplacements
       internes au clonage et rejette un proxy — le calage ne serait jamais
       enregistré, sans que rien ne le signale à l'écran. */
    // La persistance elle-même est branchée sur l'observateur profond de la page :
    // écrire ici en plus doublerait chaque enregistrement.
    corners.value = next.map(p => ({ x: p.x, y: p.y })) as unknown as Corners
  }

  const grabHandle = (point: Pt): number | null => {
    if (mode.value !== 'quad') return null

    let best: number | null = null
    let bestDistance = GRAB_RADIUS

    corners.value.forEach((corner, index) => {
      const d = distance(toPixels(corner), point)
      if (d <= bestDistance) {
        best = index
        bestDistance = d
      }
    })

    return best
  }

  const onPointerDown = (event: PointerEvent) => {
    if (locked.value) return

    const point = pointOf(event)
    pointers.set(event.pointerId, point)
    surface.value?.setPointerCapture(event.pointerId)
    gesturing.value = true

    if (pointers.size === 1) {
      activeHandle.value = grabHandle(point)
      return
    }

    // Un second doigt annule la saisie de poignée : on passe en pincement.
    activeHandle.value = null
    const [a, b] = [...pointers.values()]
    pinchStart = { a: a!, b: b!, corners: corners.value.map(toPixels) }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return

    const point = pointOf(event)
    const previous = pointers.get(event.pointerId)!
    pointers.set(event.pointerId, point)

    if (pointers.size >= 2 && pinchStart) {
      const [a, b] = [...pointers.values()]
      const start = pinchStart

      const startCenter = { x: (start.a.x + start.b.x) / 2, y: (start.a.y + start.b.y) / 2 }
      const center = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }

      const startSpan = distance(start.a, start.b)
      // Deux doigts posés exactement au même endroit : aucune échelle à déduire.
      if (startSpan === 0) return

      const scale = distance(a!, b!) / startSpan
      const angle = Math.atan2(b!.y - a!.y, b!.x - a!.x)
        - Math.atan2(start.b.y - start.a.y, start.b.x - start.a.x)

      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      /* La similitude s'applique à l'**instantané** du début du geste, jamais à la
         position courante : cumuler des deltas ferait dériver l'échelle et la
         rotation à chaque image, et le calage s'éloignerait sous les doigts. */
      commit(start.corners.map((corner) => {
        const dx = corner.x - startCenter.x
        const dy = corner.y - startCenter.y

        return toNormalized({
          x: center.x + scale * (dx * cos - dy * sin),
          y: center.y + scale * (dx * sin + dy * cos),
        })
      }) as unknown as Corners)

      return
    }

    if (activeHandle.value !== null) {
      const next = [...corners.value] as Corners
      next[activeHandle.value] = toNormalized(point)
      commit(next)

      return
    }

    // Un doigt hors poignée : translation de l'ensemble, dans les deux modes.
    const dx = point.x - previous.x
    const dy = point.y - previous.y

    commit(corners.value.map(corner => toNormalized({
      x: corner.x * size.value.w + dx,
      y: corner.y * size.value.h + dy,
    })) as unknown as Corners)
  }

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
    surface.value?.releasePointerCapture?.(event.pointerId)

    if (pointers.size < 2) pinchStart = null
    if (pointers.size === 0) {
      activeHandle.value = null
      gesturing.value = false
    }
  }

  /**
   * Suit la référence au lieu de l'échantillonner une fois.
   *
   * L'ancienne version lisait `surface.value` dans `onMounted` et sortait en
   * silence s'il était nul. Or l'élément vit derrière un `v-else` sur l'état de la
   * caméra : un échec suivi de « Réessayer » le démonte et le remonte, et les
   * écouteurs restaient attachés à l'ancien nœud, définitivement. Le calage cessait
   * de répondre sans le moindre message.
   *
   * Le contrat annoncé — « donne-moi une `Ref`, je la suis » — est désormais tenu.
   */
  let listeners: AbortController | null = null

  const unbind = () => {
    listeners?.abort()
    listeners = null
  }

  watch(surface, (el) => {
    unbind()
    if (!el) return

    listeners = new AbortController()
    const signal = listeners.signal
    el.addEventListener('pointerdown', onPointerDown, { signal })
    el.addEventListener('pointermove', onPointerMove, { signal })
    el.addEventListener('pointerup', onPointerUp, { signal })
    el.addEventListener('pointercancel', onPointerUp, { signal })
  }, { immediate: true, flush: 'post' })

  onScopeDispose(unbind)

  return { activeHandle, gesturing }
}
