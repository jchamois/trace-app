<script setup lang="ts">
/* Sans argument, et ce n'est pas qu'une simplification : l'ancien passait
   `() => useSessions().list.value.length >= 1`, soit un composable appelé **dans un
   getter de computed** — son `onScopeDispose` s'enregistrait donc hors de tout
   scope actif, à chaque réévaluation. */
const { bannerVisible, isIOS, install, dismiss } = useInstallPrompt()
</script>

<template>
  <div>
    <Transition name="banner">
      <aside
        v-if="bannerVisible"
        class="install"
      >
        <div
          class="install__icon"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>

        <div class="install__body">
          <h2 class="install__title">
            Installer trace-app
          </h2>
          <p class="install__text">
            Plein écran, sans barre de navigateur, et l’écran reste allumé pendant le tracé.
          </p>

          <div class="install__actions">
            <button
              type="button"
              class="install__accept"
              @click="install"
            >
              {{ isIOS ? 'Comment faire' : 'Installer' }}
            </button>
            <button
              type="button"
              class="install__later"
              @click="dismiss"
            >
              Plus tard
            </button>
          </div>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.install {
  position: fixed;
  z-index: 30;
  inset-inline: var(--sp-3);
  /* Au-dessus du bandeau de mise à jour, qui occupe le bas : les deux peuvent
     coexister, le handoff les empile. */
  inset-block-end: calc(var(--safe-bottom) + 6.5rem);

  display: flex;
  gap: var(--sp-3);
  padding: var(--sp-4);

  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  background-color: var(--overlay-chrome);
  box-shadow: var(--shadow-chrome);
}

.install__icon {
  flex: none;
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  border: 1px solid rgb(110 86 248 / 50%);
  border-radius: var(--r-md);
  background-color: var(--accent-soft);
  color: var(--accent);
}

.install__icon svg {
  inline-size: 1.375rem;
  block-size: 1.375rem;
}

.install__body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.install__title {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
}

.install__text {
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.install__actions {
  display: flex;
  gap: var(--sp-2);
  margin-block-start: var(--sp-1);
}

.install__accept,
.install__later {
  min-block-size: 2.75rem;
  padding-inline: var(--sp-4);
  border-radius: var(--r-md);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
}

.install__accept {
  background-color: var(--accent);
  color: var(--on-accent);
}

.install__later {
  background-color: #232327;
  color: var(--text-dim);
}

.banner-enter-active,
.banner-leave-active {
  transition: opacity var(--dur-chrome) var(--ease), transform var(--dur-chrome) var(--ease);
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(.5rem);
}
</style>
