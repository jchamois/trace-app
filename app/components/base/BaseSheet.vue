<script setup lang="ts">
/**
 * La feuille glissante du handoff : ancrée en bas, plafonnée à 60 % du viewport
 * pour que la zone de travail reste visible au-dessus, et refermable au doigt.
 *
 * Pas de voile assombrissant par défaut, et c'est délibéré : sur l'écran de
 * travail, la feuille de papier filmée doit rester lisible pendant qu'on règle les
 * curseurs — le retour visuel immédiat est tout l'intérêt du panneau.
 */
const { title, scrim = false } = defineProps<{ title: string, scrim?: boolean }>()

const emit = defineEmits<{ close: [] }>()

/** Fermeture au-delà de 40 % de la hauteur, ou sur un geste rapide. */
const CLOSE_RATIO = 0.4
const CLOSE_VELOCITY = 0.5

const sheet = useTemplateRef<HTMLElement>('sheet')

/** Décalage vertical du glissement en cours, en pixels. Jamais négatif. */
const offset = ref(0)
const dragging = ref(false)

let startY = 0
let startTime = 0

const onPointerDown = (event: PointerEvent) => {
  dragging.value = true
  startY = event.clientY
  startTime = event.timeStamp
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value) return
  // Vers le haut : rien. Une feuille ne s'agrandit pas, elle se ferme ou reste.
  offset.value = Math.max(0, event.clientY - startY)
}

const onPointerUp = (event: PointerEvent) => {
  if (!dragging.value) return
  dragging.value = false

  const height = sheet.value?.offsetHeight ?? 1
  const elapsed = Math.max(1, event.timeStamp - startTime)
  const velocity = offset.value / elapsed

  if (offset.value > height * CLOSE_RATIO || velocity > CLOSE_VELOCITY) emit('close')
  else offset.value = 0
}
</script>

<template>
  <div class="layer">
    <!-- Le voile n'est posé que sur demande, mais la zone de fermeture au toucher
         hors feuille existe dans les deux cas. -->
    <button
      type="button"
      class="layer__outside"
      :class="{ 'layer__outside--scrim': scrim }"
      @click="emit('close')"
    >
      <span class="sr-only">Fermer</span>
    </button>

    <section
      ref="sheet"
      class="sheet"
      :class="{ 'sheet--dragging': dragging }"
      :style="{ transform: `translateY(${offset}px)` }"
      role="dialog"
      aria-modal="false"
      :aria-label="title"
    >
      <div
        class="sheet__grip"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <span
          class="sheet__grip-bar"
          aria-hidden="true"
        />
      </div>

      <header class="sheet__head">
        <h2 class="sheet__title">
          {{ title }}
        </h2>

        <button
          type="button"
          class="sheet__close"
          @click="emit('close')"
        >
          <span class="sr-only">Fermer</span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </header>

      <div class="sheet__body">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer {
  position: fixed;
  z-index: 25;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  /* Le conteneur ne capte rien : seuls la zone de fermeture et la feuille le font,
     sinon la vue caméra deviendrait inerte sur toute sa hauteur. */
  pointer-events: none;
}

.layer__outside {
  flex: 1;
  pointer-events: auto;
}

.layer__outside--scrim {
  background-color: var(--scrim);
}

.sheet {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  max-block-size: var(--sheet-max-h);
  padding: .625rem var(--sp-5) calc(var(--safe-bottom) + var(--sp-5));

  border-block-start: 1px solid rgb(255 255 255 / 14%);
  border-start-start-radius: var(--r-sheet);
  border-start-end-radius: var(--r-sheet);
  background-color: rgb(15 15 17 / 97%);
  box-shadow: var(--shadow-sheet);

  animation: sheet-in var(--dur-sheet) var(--ease);
  transition: transform var(--dur-sheet) var(--ease);
}

/* Pendant le glissement la feuille doit coller au doigt : toute transition la
   ferait traîner derrière lui. */
.sheet--dragging {
  transition: none;
}

.sheet__grip {
  display: grid;
  place-items: center;
  /* Cible de 48 px pour une barre qui n'en fait que 5 : c'est la règle des doigts
     graphités, et la poignée est le geste de fermeture le plus courant. */
  block-size: var(--touch-min);
  margin-block-start: calc(var(--touch-min) * -.5 + .625rem);
  touch-action: none;
  cursor: grab;
}

.sheet__grip-bar {
  inline-size: 2.75rem;
  block-size: .3125rem;
  border-radius: var(--r-pill);
  background-color: rgb(255 255 255 / 18%);
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
}

.sheet__title {
  font-size: var(--fs-title);
  font-weight: var(--fw-semibold);
  letter-spacing: -.02em;
}

.sheet__close {
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  border-radius: var(--r-pill);
  background-color: var(--surface-2);
  color: var(--text-dim);
}

.sheet__close svg {
  inline-size: 1.125rem;
  block-size: 1.125rem;
}

.sheet__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  overflow-y: auto;
  /* Empêche le défilement de la feuille de se propager à la page dessous. */
  overscroll-behavior: contain;
}

@keyframes sheet-in {
  from { transform: translateY(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
</style>
