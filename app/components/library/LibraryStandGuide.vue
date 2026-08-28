<script setup lang="ts">
/**
 * Le prérequis matériel, expliqué.
 *
 * Sans support, l'image bouge à chaque respiration et la première séance est un
 * échec — imputé au logiciel. Le bouton qui ouvre cette feuille était prévu au
 * handoff mais n'avait jamais été branché : `LibraryEmpty` émettait un `help` que
 * personne n'écoutait.
 */
const emit = defineEmits<{ close: [] }>()

const STEPS = [
  {
    title: 'Un bras à pince ou un col-de-cygne',
    body: 'Une quinzaine d’euros. C’est le seul achat nécessaire, et il conditionne '
      + 'tout le reste : à main levée, l’image bouge à chaque respiration.',
  },
  {
    title: 'Le téléphone au-dessus de la feuille, caméra vers le bas',
    body: 'À 25 ou 30 cm environ. La feuille entière doit tenir dans l’image, avec '
      + 'un peu de marge autour.',
  },
  {
    title: 'Évite que le téléphone porte son ombre sur le papier',
    body: 'Décale-le légèrement, ou allume la torche depuis la barre d’outils.',
  },
  {
    title: 'Cale, puis verrouille avant de dessiner',
    body: 'Le verrou empêche ta main de déplacer l’image au premier frôlement — '
      + 'sans lui, une heure de calage part au premier appui.',
  },
]
</script>

<template>
  <BaseSheet
    title="Installer le support"
    scrim
    @close="emit('close')"
  >
    <ol class="guide">
      <li
        v-for="(step, index) in STEPS"
        :key="step.title"
        class="guide__item"
      >
        <span
          class="guide__number"
          aria-hidden="true"
        >{{ index + 1 }}</span>
        <span class="guide__text">
          <span class="guide__title">{{ step.title }}</span>
          <span class="guide__body">{{ step.body }}</span>
        </span>
      </li>
    </ol>

    <p class="note">
      Un téléphone ne projette pas de lumière : l’image se superpose au flux de la
      caméra, à l’écran. Tu regardes l’écran, ta main dessine dessous.
    </p>
  </BaseSheet>
</template>

<style scoped>
.guide {
  border: 1px solid var(--line-soft);
  border-radius: var(--r-lg);
  background-color: #141417;
}

.guide__item {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4);
}

.guide__item + .guide__item {
  border-block-start: 1px solid var(--line-soft);
}

.guide__number {
  flex: none;
  /* Aligné sur la première ligne du titre, pas sur le centre du bloc. */
  padding-block-start: .125rem;
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  color: var(--accent);
}

.guide__text {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.guide__title {
  font-size: var(--fs-label);
  font-weight: var(--fw-medium);
}

.guide__body {
  font-size: .8125rem;
  line-height: 1.5;
  color: var(--text-dim);
}

.note {
  font-size: .8125rem;
  line-height: 1.5;
  color: var(--text-faint);
}
</style>
