<script setup lang="ts">
/**
 * L'écran de travail. Deux modes :
 *
 * - **calage** — poignées visibles, gestes actifs, barre d'outils déployée ;
 * - **dessin** — tout le chrome escamoté, gestes verrouillés, écran maintenu
 *   allumé. C'est l'écran qu'on regarde pendant une heure.
 *
 * Le verrou du mode dessin n'est pas un détail de confort : sans lui, la main qui
 * dessine sous le téléphone déplace l'image au premier frôlement, et une heure de
 * calage part avec.
 */
import { formatCm } from '~/utils/paper'
import type { TraceSession } from '~/utils/session'
import { defaultCorners, PAPER_LABELS } from '~/utils/session'

/** Repli inerte pour la fenêtre — d'une image — où les gestes existent sans calage. */
const UNCALIBRATED = defaultCorners(1, { w: 1, h: 1 })

const route = useRoute()
const { get, putSoon, flush } = useSessions()

const session = ref<TraceSession | null>(null)
const missing = ref(false)
const imageSize = ref({ w: 0, h: 0 })

const camera = useCamera()
const wakeLock = useWakeLock()

type Sheet = 'none' | 'image' | 'paper'
const sheet = ref<Sheet>('none')
const drawing = ref(false)
const peeking = ref(false)

const surface = useTemplateRef<HTMLElement>('surface')
const size = ref({ w: 0, h: 0 })

useSeoMeta({ title: () => session.value?.name ?? 'Tracé' })

/* La barre d'état et la barre de navigation du système volent une bande de la vue
   caméra. On demande le plein écran à l'entrée en mode dessin, pas au chargement :
   l'API exige un geste utilisateur, et le manifeste reste en `standalone` pour que
   la bibliothèque garde sa barre d'état. */
const enterFullscreen = async () => {
  // Absent sur iPhone : l'appel échoue, et c'est sans conséquence.
  await document.documentElement.requestFullscreen?.().catch(() => {})
}

const startDrawing = async () => {
  sheet.value = 'none'
  drawing.value = true
  await enterFullscreen()
  await wakeLock.request()
}

const stopDrawing = async () => {
  drawing.value = false
  peeking.value = false
  await wakeLock.release()
  await document.exitFullscreen?.().catch(() => {})
}

/**
 * Le calage par défaut dépend des proportions du viewport, qu'on ne connaît qu'ici.
 * C'est aussi ce qui rend « Recaler » trivial : le panneau papier remet `corners` à
 * `null`, et le défaut se recalcule tout seul.
 */
watch([size, session], () => {
  if (!session.value || session.value.corners || !size.value.w) return

  const { w, h } = session.value.paperSizeCm
  session.value.corners = defaultCorners(w / h, size.value)
}, { deep: true })

const gestures = useTraceGestures({
  surface,
  corners: computed({
    // La surface existe avant que la session soit lue et avant le premier calage :
    // `locked` rend le cas inatteignable, mais un getter qui peut lever n'a pas sa
    // place dans un `computed`.
    get: () => session.value?.corners ?? UNCALIBRATED,
    set: (value) => {
      if (session.value) session.value.corners = value
    },
  }),
  size,
  mode: computed(() => session.value?.mode ?? 'simple'),
  locked: computed(() => drawing.value || !session.value?.corners),
})

/* Appui long : on efface le calque tant que le doigt reste posé, pour juger le
   tracé au crayon seul. C'est le seul geste que le mode dessin laisse passer en
   dehors du bouton de déverrouillage — un frôlement bref ne déclenche rien, et le
   calque revient au relâchement, donc rien n'est perdu. */
const PEEK_DELAY = 400
let peekTimer: ReturnType<typeof setTimeout> | null = null

const onSurfaceDown = () => {
  if (!drawing.value) return
  peekTimer = setTimeout(() => {
    peeking.value = true
  }, PEEK_DELAY)
}

const onSurfaceUp = () => {
  if (peekTimer) clearTimeout(peekTimer)
  peekTimer = null
  peeking.value = false
}

const toggleMode = () => {
  if (!session.value) return
  session.value.mode = session.value.mode === 'quad' ? 'simple' : 'quad'
}

const paperLabel = computed(() => {
  if (!session.value) return ''
  const { paperFormat, paperSizeCm } = session.value

  return `${PAPER_LABELS[paperFormat]} · ${formatCm(paperSizeCm.w)} × ${formatCm(paperSizeCm.h)} cm`
})

const hint = computed(() => {
  if (!session.value || gestures.gesturing.value) return null
  if (session.value.mode === 'quad') return 'Pose une poignée sur chaque coin de la feuille'

  return 'Glisse pour déplacer, pince pour redimensionner'
})

/* `ResizeObserver` et non `window.resize` : la barre d'URL de Safari se rétracte au
   défilement sans émettre de `resize`, et le conteneur change pourtant de hauteur.
   Les coins étant normalisés dessus, un décalage passerait inaperçu jusqu'au tracé. */
let observer: ResizeObserver | null = null

onMounted(async () => {
  const id = String(route.params.id)
  const found = await get(id)

  if (!found) {
    missing.value = true
    return
  }

  session.value = found

  await nextTick()

  if (surface.value) {
    observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect
      size.value = { w: box.width, h: box.height }
    })
    observer.observe(surface.value)
  }

  await camera.start()
})

/* Toute mutation de la session est persistée, calage compris — le débounce vit dans
   `useSessions`, pas ici. Le premier déclenchement est la lecture elle-même : le
   compter réécrirait `updatedAt` à la simple ouverture, ce qui remonterait le tracé
   en tête de bibliothèque sans qu'on y ait touché. */
let loaded = false

watch(session, (value) => {
  if (!loaded) {
    loaded = true
    return
  }
  if (value) putSoon(value)
}, { deep: true })

onBeforeUnmount(async () => {
  observer?.disconnect()
  // Sortir de l'écran pendant la fenêtre de débounce perdrait le dernier calage,
  // c'est-à-dire précisément celui qu'on venait d'ajuster.
  await flush()
})
</script>

<template>
  <TraceCameraError
    v-if="camera.status.value !== 'ready' && camera.status.value !== 'starting' && camera.status.value !== 'idle'"
    :status="camera.status.value"
    @retry="camera.start()"
  />

  <div
    v-else-if="missing"
    class="gone"
  >
    <p>Ce tracé n’existe plus sur cet appareil.</p>
    <NuxtLink
      to="/"
      class="gone__link"
    >
      Retour à la bibliothèque
    </NuxtLink>
  </div>

  <main
    v-else
    class="work"
  >
    <div
      ref="surface"
      class="work__surface"
      @pointerdown="onSurfaceDown"
      @pointerup="onSurfaceUp"
      @pointercancel="onSurfaceUp"
    >
      <TraceCanvas
        v-if="session"
        :stream="camera.stream.value"
        :session="session"
        :size="size"
        :hidden="peeking"
        @loaded="imageSize = $event"
      />

      <TraceCornerHandles
        v-if="session?.corners && session.mode === 'quad' && !drawing"
        :corners="session.corners"
        :size="size"
        :active="gestures.activeHandle.value"
      />
    </div>

    <template v-if="session">
      <Transition name="chrome">
        <div
          v-if="!drawing"
          class="work__chrome"
        >
          <div class="work__top">
            <p class="pill pill--mode">
              <span
                class="pill__mark"
                aria-hidden="true"
              />
              {{ session.mode === 'quad' ? 'Calage' : 'Cadrage' }}
            </p>

            <p class="pill pill--format">
              {{ paperLabel }}
            </p>
          </div>

          <p
            v-if="hint"
            class="work__hint"
          >
            {{ hint }}
          </p>

          <TraceToolbar
            :mode="session.mode"
            :has-torch="camera.hasTorch.value"
            :torch-on="camera.torchOn.value"
            @toggle-mode="toggleMode"
            @open-image="sheet = 'image'"
            @open-paper="sheet = 'paper'"
            @toggle-torch="camera.toggleTorch()"
            @draw="startDrawing"
          />
        </div>
      </Transition>

      <template v-if="drawing">
        <p class="work__locked">
          écran verrouillé · touche le cadenas pour déverrouiller
        </p>

        <button
          type="button"
          class="work__unlock"
          @click="stopDrawing"
        >
          <span class="sr-only">Déverrouiller les réglages</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect
              x="5"
              y="10.5"
              width="14"
              height="9.5"
              rx="2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path
              d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
          </svg>
        </button>
      </template>

      <TraceFilterPanel
        v-if="sheet === 'image'"
        v-model="session"
        @close="sheet = 'none'"
      />

      <TracePaperPanel
        v-if="sheet === 'paper'"
        v-model="session"
        :image-size="imageSize"
        @close="sheet = 'none'"
      />
    </template>
  </main>
</template>

<style scoped>
.work {
  position: relative;
  block-size: 100dvh;
  overflow: hidden;
  background-color: #000;
}

.work__surface {
  position: absolute;
  inset: 0;
  /* Impératif : sans lui, le navigateur interprète le glissement comme un
     défilement et le calage ne bouge pas. */
  touch-action: none;
}

.work__top {
  position: absolute;
  z-index: 20;
  inset-inline: var(--sp-3);
  inset-block-start: calc(var(--safe-top) + var(--sp-8));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.pill {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  block-size: 2.75rem;
  padding-inline: var(--sp-4);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  /* Fond opaque : derrière, la vidéo passe du blanc surexposé au noir. */
  background-color: rgb(16 16 18 / 88%);
  font-size: var(--fs-label);
}

.pill--format {
  font-family: var(--font-mono);
  font-size: .75rem;
  color: var(--text-dim);
}

.pill__mark {
  inline-size: .5625rem;
  block-size: .5625rem;
  rotate: 45deg;
  background-color: var(--accent);
}

.work__hint {
  position: absolute;
  z-index: 20;
  inset-inline: var(--sp-3);
  /* Juste au-dessus de la barre d'outils, jamais dessous. */
  inset-block-end: calc(var(--safe-bottom) + var(--sp-5) + var(--toolbar-h) + var(--sp-2));
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--r-md);
  background-color: rgb(16 16 18 / 88%);
  font-size: .8125rem;
  color: var(--text-dim);
  text-align: center;
}

.work__locked {
  position: absolute;
  z-index: 20;
  inset-block-end: calc(var(--safe-bottom) + var(--sp-6));
  inset-inline-start: var(--sp-5);
  font-family: var(--font-mono);
  font-size: .6875rem;
  color: rgb(242 241 238 / 35%);
  pointer-events: none;
}

.work__unlock {
  position: absolute;
  z-index: 20;
  inset-block-end: calc(var(--safe-bottom) + var(--sp-5));
  inset-inline-end: var(--sp-5);
  display: grid;
  place-items: center;
  inline-size: 3.25rem;
  block-size: 3.25rem;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: var(--r-pill);
  background-color: rgb(14 14 16 / 82%);
  color: var(--accent);
}

.work__unlock svg {
  inline-size: 1.375rem;
  block-size: 1.375rem;
}

.chrome-enter-active,
.chrome-leave-active {
  transition: opacity var(--dur-chrome) var(--ease), transform var(--dur-chrome) var(--ease);
}

.chrome-enter-from,
.chrome-leave-to {
  opacity: 0;
  transform: translateY(.5rem);
}

.gone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  min-block-size: 100dvh;
  padding-inline: var(--sp-6);
  text-align: center;
  color: var(--text-dim);
}

.gone__link {
  min-block-size: var(--touch-min);
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-lg);
  background-color: var(--accent);
  color: var(--on-accent);
  font-weight: var(--fw-semibold);
}
</style>
