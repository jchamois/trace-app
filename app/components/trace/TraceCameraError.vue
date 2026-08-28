<script setup lang="ts">
/**
 * Les impasses de la caméra. Chacune a son remède, et proposer le mauvais est ce
 * qui fait abandonner : « réessayer » ne répare pas une page servie en HTTP, et
 * ouvrir les réglages ne rend pas une caméra à un appareil qui n'en a pas.
 */
import type { CameraStatus } from '~/composables/useCamera'

const { status } = defineProps<{ status: CameraStatus }>()

const emit = defineEmits<{ retry: [] }>()

const COPY: Record<string, { title: string, body: string, steps?: string[], retry: boolean }> = {
  'denied': {
    title: 'Accès caméra refusé',
    body: 'trace-app a besoin de la caméra arrière pour afficher ta feuille. '
      + 'Aucune image n’est enregistrée ni envoyée.',
    steps: [
      'Ouvre les réglages du site, ou Réglages › trace-app',
      'Autorise « Appareil photo »',
      'Reviens ici et touche « Réessayer »',
    ],
    retry: true,
  },
  'no-camera': {
    title: 'Aucune caméra détectée',
    body: 'Cet appareil n’expose pas de caméra. Tu peux quand même préparer ton image : '
      + 'le rendu et l’opacité seront conservés pour ta prochaine séance sur téléphone.',
    retry: false,
  },
  'insecure': {
    title: 'Connexion non sécurisée',
    body: 'Les navigateurs n’ouvrent la caméra qu’en HTTPS. Ouvre trace-app depuis son '
      + 'adresse sécurisée — en développement, un canal de préversion Firebase fournit '
      + 'une URL valide.',
    retry: false,
  },
  'busy': {
    title: 'Caméra occupée',
    body: 'Une autre application utilise déjà la caméra. Ferme-la, puis réessaie.',
    retry: true,
  },
  'failed': {
    title: 'La caméra n’a pas démarré',
    body: 'Le navigateur a refusé l’accès sans en dire la raison. Réessaie, ou relance '
      + 'l’application.',
    retry: true,
  },
}

const copy = computed(() => COPY[status] ?? COPY.failed!)
</script>

<template>
  <div class="error">
    <div
      class="error__icon"
      :class="{ 'error__icon--muted': status === 'no-camera' }"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <circle
          cx="12"
          cy="12.5"
          r="3.2"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <path
          d="M4 3.5 20 20"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </div>

    <h1 class="error__title">
      {{ copy.title }}
    </h1>

    <p class="error__body">
      {{ copy.body }}
    </p>

    <ol
      v-if="copy.steps"
      class="error__steps"
    >
      <li
        v-for="(step, index) in copy.steps"
        :key="step"
        class="error__step"
      >
        <span
          class="error__number"
          aria-hidden="true"
        >{{ index + 1 }}</span>
        {{ step }}
      </li>
    </ol>

    <div class="error__actions">
      <button
        v-if="copy.retry"
        type="button"
        class="error__primary"
        @click="emit('retry')"
      >
        Réessayer
      </button>

      <NuxtLink
        to="/"
        class="error__secondary"
      >
        Retour à la bibliothèque
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  min-block-size: 100dvh;
  padding: calc(var(--safe-top) + var(--sp-8)) var(--sp-6) calc(var(--safe-bottom) + var(--sp-6));
  text-align: center;
}

.error__icon {
  display: grid;
  place-items: center;
  inline-size: 4rem;
  block-size: 4rem;
  border: 1px solid rgb(110 86 248 / 50%);
  border-radius: var(--r-xl);
  background-color: var(--accent-soft);
  color: var(--accent);
}

.error__icon--muted {
  border-color: var(--line);
  background-color: #141417;
  color: var(--text-dim);
}

.error__icon svg {
  inline-size: 1.75rem;
  block-size: 1.75rem;
}

.error__title {
  font-size: 1.625rem;
  font-weight: var(--fw-bold);
  letter-spacing: -.02em;
}

.error__body {
  max-inline-size: 36ch;
  line-height: 1.55;
  color: var(--text-dim);
}

.error__steps {
  inline-size: 100%;
  max-inline-size: 26rem;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-lg);
  background-color: #141417;
  text-align: start;
}

.error__step {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4);
  font-size: var(--fs-label);
}

.error__step + .error__step {
  border-block-start: 1px solid var(--line-soft);
}

.error__number {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  color: var(--accent);
}

.error__actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  inline-size: 100%;
  max-inline-size: 26rem;
  margin-block-start: var(--sp-2);
}

.error__primary,
.error__secondary {
  display: grid;
  place-items: center;
  min-block-size: 3.5rem;
  border-radius: var(--r-lg);
  font-size: var(--fs-action);
  font-weight: var(--fw-semibold);
}

.error__primary {
  background-color: var(--accent);
  color: var(--on-accent);
}

.error__secondary {
  border: 1px solid var(--line);
  background-color: #18181B;
}
</style>
