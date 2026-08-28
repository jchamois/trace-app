/**
 * Le flux caméra, et surtout ses façons d'échouer.
 *
 * Toutes les branches d'erreur ci-dessous sont atteignables en usage réel — refus
 * de permission, page servie en HTTP, caméra déjà prise par une autre application.
 * Les distinguer n'est pas du zèle : « réessayer » ne répare qu'un seul de ces cas,
 * et proposer le mauvais remède est ce qui fait abandonner.
 */

/**
 * - `idle` — rien n'a encore été demandé.
 * - `denied` — permission refusée : le seul cas qui passe par les réglages système.
 * - `no-camera` — l'appareil n'expose aucune caméra.
 * - `insecure` — page servie hors contexte sécurisé : `getUserMedia` n'existe pas.
 * - `busy` — caméra présente, mais monopolisée par une autre application.
 */
export type CameraStatus
  = 'idle' | 'starting' | 'ready' | 'denied' | 'no-camera' | 'insecure' | 'busy' | 'failed'

export type Facing = 'environment' | 'user' | 'unknown'

export interface Camera {
  stream: Ref<MediaStream | null>
  status: Ref<CameraStatus>
  /** Renseigné quand `status` vaut `failed` : le message brut du navigateur. */
  detail: Ref<string | null>
  facing: Ref<Facing>
  hasTorch: Ref<boolean>
  torchOn: Ref<boolean>
  start: () => Promise<void>
  stop: () => void
  toggleTorch: () => Promise<void>
}

/* `ideal` et non `exact`, contre la recommandation du handoff. `exact` lève
   `OverconstrainedError` sur tout appareil sans caméra arrière — un portable, une
   tablette — et l'utilisateur atterrit alors sur « aucune caméra détectée » alors
   qu'une caméra existe. Avec `ideal` on obtient l'arrière quand elle existe, la
   frontale sinon, et `facing` dit lequel des deux : trois cas au lieu de deux. */
const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    /* On demande large et on laisse le navigateur cadrer : la définition réelle
       n'a pas besoin d'être exacte, elle est de toute façon affichée en `cover`.
       Une contrainte stricte ferait échouer la demande sur les capteurs modestes. */
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
}

/** Capacités hors spécification standard, exposées par Chrome sur Android. */
interface AdvancedCapabilities extends MediaTrackCapabilities {
  torch?: boolean
  focusMode?: string[]
  exposureMode?: string[]
}

/**
 * Verrouille mise au point et exposition quand la plateforme le permet.
 *
 * Une refocalisation en cours de tracé déplace visuellement la feuille sous le
 * calque, et une correction d'exposition sur une main qui passe fait « respirer »
 * l'image. Aucun des deux ne fausse le calage, mais les deux fatiguent l'œil sur
 * une heure. Chrome Android uniquement ; ailleurs l'appel est simplement ignoré.
 */
const lockOptics = async (track: MediaStreamTrack) => {
  const caps = track.getCapabilities?.() as AdvancedCapabilities | undefined
  if (!caps) return

  const advanced: MediaTrackConstraintSet[] = []
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' } as MediaTrackConstraintSet)
  if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' } as MediaTrackConstraintSet)
  if (!advanced.length) return

  await track.applyConstraints({ advanced }).catch(() => {})
}

const statusForError = (error: unknown): CameraStatus => {
  if (!(error instanceof DOMException)) return 'failed'

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-camera'
    // `NotReadableError` : le capteur existe mais un autre processus le tient.
    case 'NotReadableError':
    case 'AbortError':
      return 'busy'
    default:
      return 'failed'
  }
}

export const useCamera = (): Camera => {
  const stream = shallowRef<MediaStream | null>(null)
  const status = ref<CameraStatus>('idle')
  const detail = ref<string | null>(null)
  const facing = ref<Facing>('unknown')
  const hasTorch = ref(false)
  const torchOn = ref(false)

  const stop = () => {
    stream.value?.getTracks().forEach(track => track.stop())
    stream.value = null
    hasTorch.value = false
    torchOn.value = false
    if (status.value === 'ready') status.value = 'idle'
  }

  const start = async () => {
    if (status.value === 'starting') return
    stop()

    /* `mediaDevices` est absent — et non pas seulement en échec — hors contexte
       sécurisé. C'est le cas d'un `nuxt dev --host` servi en HTTP simple depuis un
       téléphone, la première façon dont on tombe dessus. */
    if (!navigator.mediaDevices?.getUserMedia) {
      status.value = 'insecure'
      return
    }

    status.value = 'starting'
    detail.value = null

    try {
      const media = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      const track = media.getVideoTracks()[0]

      if (!track) {
        media.getTracks().forEach(t => t.stop())
        status.value = 'no-camera'
        return
      }

      const settings = track.getSettings()
      facing.value = settings.facingMode === 'environment'
        ? 'environment'
        : settings.facingMode === 'user' ? 'user' : 'unknown'

      hasTorch.value = Boolean((track.getCapabilities?.() as AdvancedCapabilities | undefined)?.torch)

      await lockOptics(track)

      stream.value = media
      status.value = 'ready'
    }
    catch (error) {
      status.value = statusForError(error)
      detail.value = error instanceof Error ? error.message : String(error)
    }
  }

  /** La torche éclaire la feuille : indispensable dès que le téléphone l'ombre. */
  const toggleTorch = async () => {
    const track = stream.value?.getVideoTracks()[0]
    if (!track || !hasTorch.value) return

    const next = !torchOn.value
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
    torchOn.value = next
  }

  /* Impératif : sans `track.stop()`, le voyant de la caméra reste allumé après la
     sortie de l'écran et le capteur reste réservé à cet onglet. */
  onScopeDispose(stop)

  return { stream, status, detail, facing, hasTorch, torchOn, start, stop, toggleTorch }
}
