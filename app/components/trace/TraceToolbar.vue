<script setup lang="ts">
/**
 * La barre d'outils flottante. En portrait elle occupe le tiers bas, atteignable au
 * pouce d'une seule main — l'autre tient le crayon. En paysage elle migre sur le
 * côté droit, la largeur devenant la ressource rare.
 *
 * Chaque bouton porte son propre fond : derrière la barre il y a une image vidéo
 * imprévisible, tantôt la feuille blanche surexposée, tantôt l'ombre de la table.
 */
import type { AlignMode } from '~/utils/session'

const { mode, hasTorch, torchOn } = defineProps<{
  mode: AlignMode
  hasTorch: boolean
  torchOn: boolean
}>()

const emit = defineEmits<{
  'toggle-mode': []
  'open-image': []
  'open-paper': []
  'toggle-torch': []
  'draw': []
}>()
</script>

<template>
  <div class="bar">
    <button
      type="button"
      class="bar__tool"
      :class="{ 'bar__tool--on': mode === 'quad' }"
      :aria-pressed="mode === 'quad'"
      @click="emit('toggle-mode')"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M12 3.5 20.5 12 12 20.5 3.5 12z"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
      </svg>
      Calage
    </button>

    <button
      type="button"
      class="bar__tool"
      @click="emit('open-image')"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M4 7h16M4 12h16M4 17h16"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
      Image
    </button>

    <button
      type="button"
      class="bar__tool"
      @click="emit('open-paper')"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect
          x="5"
          y="3.5"
          width="14"
          height="17"
          rx="2"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        />
      </svg>
      Papier
    </button>

    <button
      type="button"
      class="bar__tool"
      :class="{ 'bar__tool--on': torchOn }"
      :aria-pressed="torchOn"
      :disabled="!hasTorch"
      :title="hasTorch ? undefined : 'Cet appareil n’expose pas de torche.'"
      @click="emit('toggle-torch')"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        />
      </svg>
      Lumière
    </button>

    <button
      type="button"
      class="bar__draw"
      @click="emit('draw')"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M4 17c4-9 12-9 16 0"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      </svg>
      Dessiner
    </button>
  </div>
</template>

<style scoped>
.bar {
  position: absolute;
  z-index: 20;
  inset-inline: var(--sp-3);
  inset-block-end: calc(var(--safe-bottom) + var(--sp-5));

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  min-block-size: var(--toolbar-h);
  padding-inline: var(--sp-3);

  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background-color: var(--overlay-chrome);
  box-shadow: var(--shadow-chrome);
}

.bar__tool,
.bar__draw {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  block-size: 3.5rem;
  border-radius: var(--r-md);
  font-size: .625rem;
  font-weight: var(--fw-medium);
}

.bar__tool {
  inline-size: 3.75rem;
  border: 1px solid transparent;
  color: var(--text-dim);
}

.bar__tool svg,
.bar__draw svg {
  inline-size: 1.375rem;
  block-size: 1.375rem;
}

.bar__tool--on {
  border-color: var(--accent);
  background-color: var(--accent-soft);
  color: var(--accent);
}

.bar__tool:disabled {
  opacity: .35;
}

.bar__draw {
  inline-size: 4.625rem;
  background-color: var(--accent);
  color: var(--on-accent);
  font-weight: var(--fw-bold);
}

/* En paysage la hauteur devient la ressource rare : la barre passe en colonne sur
   le côté droit plutôt que d'amputer la vue de la feuille. */
@media (orientation: landscape) {
  .bar {
    inset-inline: auto var(--sp-4);
    inset-block: var(--sp-4);
    flex-direction: column;
    inline-size: 5.25rem;
    padding-block: var(--sp-3);
    padding-inline: 0;
    box-shadow: -12px 0 34px rgb(0 0 0 / 55%);
  }

  .bar__tool,
  .bar__draw {
    inline-size: 4rem;
  }
}
</style>
