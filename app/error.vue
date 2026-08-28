<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()

/* `clearError` et non `navigateTo` : il faut vider l'état d'erreur de Nuxt avant de
   rendre une route, sinon la page d'erreur se réaffiche à la navigation suivante. */
const backHome = () => clearError({ redirect: '/' })
</script>

<template>
  <main class="error">
    <p class="error__code">
      {{ error.statusCode }}
    </p>

    <h1 class="error__title">
      {{ error.statusCode === 404 ? 'Page introuvable' : 'Quelque chose a cassé' }}
    </h1>

    <p class="error__body">
      Tes tracés sont intacts : ils sont enregistrés sur cet appareil, pas sur un serveur.
    </p>

    <button
      type="button"
      class="error__action"
      @click="backHome"
    >
      Retour à la bibliothèque
    </button>
  </main>
</template>

<style scoped>
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  min-block-size: 100dvh;
  padding: var(--pad-top) var(--sp-8) var(--pad-bottom);
  text-align: center;
}

.error__code {
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  color: var(--accent);
  letter-spacing: .1em;
}

.error__title {
  font-size: var(--fs-display);
  font-weight: var(--fw-bold);
  letter-spacing: -.02em;
}

.error__body {
  max-inline-size: 34ch;
  color: var(--text-dim);
  line-height: 1.55;
}

.error__action {
  min-block-size: var(--touch-min);
  margin-block-start: var(--sp-2);
  padding-inline: var(--sp-6);
  border-radius: var(--r-lg);
  background-color: var(--accent);
  color: var(--on-accent);
  font-size: var(--fs-action);
  font-weight: var(--fw-semibold);
}
</style>
