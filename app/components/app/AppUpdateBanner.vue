<script setup lang="ts">
const { $pwa } = useNuxtApp()

/* Le rechargement n'est pas immédiat : SKIP_WAITING, activation du nouveau worker
   puis reprise du contrôle prennent plusieurs secondes sur mobile. Sans état
   d'attente la bannière reste figée sous le doigt et l'application paraît plantée. */
const pending = ref(false)

const listeners = new AbortController()

const applyUpdate = () => {
  pending.value = true

  /* Le rechargement de `vite-plugin-pwa` est conditionné à son drapeau `isUpdate`,
     faux quand le service worker vient d'être enregistré dans cette même page :
     dans ce cas rien ne recharge et la bannière reste indéfiniment sur
     « Rechargement… ». On recharge donc soi-même dès que le nouveau worker prend la
     main — `clientsClaim` garantit qu'il la prend. Deux appels concurrents à
     `reload()` sont sans effet. */
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => location.reload(),
    { once: true, signal: listeners.signal },
  )

  $pwa?.updateServiceWorker()
}

/* `client.periodicSyncForUpdates` ne vérifie qu'une fois par heure : une PWA
   ouverte dix minutes ne verrait rien. Le retour au premier plan est le moment
   utile — `useAppResume` porte les deux événements que cela demande. */
useAppResume(async () => {
  // Absent hors contexte sécurisé — `nuxt dev` servi sur une IP de LAN en HTTP.
  if (!navigator.serviceWorker) return

  const registration = await navigator.serviceWorker.getRegistration()
  await registration?.update().catch(() => {})
})

onScopeDispose(() => listeners.abort())
</script>

<template>
  <Transition name="banner">
    <aside
      v-if="$pwa?.needRefresh"
      class="update"
      role="status"
    >
      <span
        class="update__dot"
        aria-hidden="true"
      />

      <p class="update__text">
        Nouvelle version disponible
      </p>

      <button
        type="button"
        class="update__action"
        :disabled="pending"
        @click="applyUpdate"
      >
        {{ pending ? 'Rechargement…' : 'Recharger' }}
      </button>
    </aside>
  </Transition>
</template>

<style scoped>
.update {
  position: fixed;
  z-index: 40;
  inset-inline: var(--sp-3);
  /* Au-dessus de la zone sûre basse, comme le handoff : le bandeau ne doit pas
     tomber sous la barre de gestes système. */
  inset-block-end: calc(var(--safe-bottom) + var(--sp-5));

  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);

  border: 1px solid rgb(110 86 248 / 45%);
  border-radius: var(--r-xl);
  background-color: var(--overlay-chrome);
  box-shadow: var(--shadow-chrome);
}

.update__dot {
  flex: none;
  inline-size: .5rem;
  block-size: .5rem;
  border-radius: var(--r-pill);
  background-color: var(--accent);
}

.update__text {
  flex: 1;
  font-size: var(--fs-label);
}

.update__action {
  flex: none;
  min-block-size: 2.5rem;
  padding-inline: var(--sp-4);
  border-radius: var(--r-md);
  background-color: var(--accent);
  color: var(--on-accent);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
}

.update__action:disabled {
  opacity: .6;
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
