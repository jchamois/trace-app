<script setup lang="ts">
/**
 * Les gestes d'installation d'iOS Safari, seul navigateur où
 * `beforeinstallprompt` n'existe pas : il n'y a rien à déclencher, seulement à
 * montrer. Réservé à iOS — ces étapes parlent du bouton Partager de Safari et
 * n'auraient aucun sens ailleurs.
 */
const emit = defineEmits<{ close: [] }>()

const STEPS = [
  'Touche le bouton Partager, en bas de Safari',
  'Fais défiler et choisis « Sur l’écran d’accueil »',
  'Valide avec « Ajouter »',
]
</script>

<template>
  <BaseSheet
    title="Installer sur iPhone"
    scrim
    @close="emit('close')"
  >
    <ol class="steps">
      <li
        v-for="(step, index) in STEPS"
        :key="step"
        class="steps__item"
      >
        <span
          class="steps__number"
          aria-hidden="true"
        >{{ index + 1 }}</span>
        <span class="steps__label">{{ step }}</span>
      </li>
    </ol>

    <p class="note">
      L’application s’ouvrira alors en plein écran, et gardera l’écran allumé pendant
      que tu dessines.
    </p>
  </BaseSheet>
</template>

<style scoped>
.steps {
  border: 1px solid var(--line-soft);
  border-radius: var(--r-lg);
  background-color: #141417;
}

.steps__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4);
}

.steps__item + .steps__item {
  border-block-start: 1px solid var(--line-soft);
}

.steps__number {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  color: var(--accent);
}

.steps__label {
  font-size: var(--fs-label);
}

.note {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-faint);
}
</style>
