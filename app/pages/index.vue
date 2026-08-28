<script setup lang="ts">
import { importImage } from '~/utils/imageImport'
import { createSession } from '~/utils/session'

useSeoMeta({
  title: 'Mes tracés',
  description: 'Décalquez une photo sur une feuille de papier en la superposant au flux de votre caméra.',
})

const { list, loading, refresh, put } = useSessions()

const menuOpen = ref(false)
const importing = ref(false)
const importError = ref<string | null>(null)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

/* La liste vit dans `useState`, donc elle survit à un aller-retour vers l'écran de
   travail. On la relit quand même au retour : le calage y a changé, et avec lui
   l'ordre d'affichage. */
onMounted(refresh)

const newest = computed(() => list.value[0]?.id ?? null)

const pickImage = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  importing.value = true
  importError.value = null

  try {
    const { image, thumb } = await importImage(file)

    const session = createSession({
      // `randomUUID` exige un contexte sécurisé — le même que `getUserMedia`, donc
      // toujours disponible là où l'application est réellement utilisable.
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, '') || 'Sans titre',
      image,
      thumb,
    })

    await put(session)
    await navigateTo(`/trace/${session.id}`)
  }
  catch {
    importError.value = 'Cette image n’a pas pu être lue. Essaie une autre photo.'
  }
  finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="library">
    <header class="library__head">
      <h1 class="library__title">
        Mes tracés
      </h1>

      <button
        v-if="list.length"
        type="button"
        class="library__menu"
        aria-haspopup="dialog"
        :aria-expanded="menuOpen"
        @click="menuOpen = true"
      >
        <span class="sr-only">Sauvegarder ou restaurer</span>
        <span
          class="library__bars"
          aria-hidden="true"
        >
          <span /><span /><span />
        </span>
      </button>
    </header>

    <!-- `loading` seulement au tout premier chargement : au retour de l'écran de
         travail la liste est déjà là, un état de chargement ferait clignoter. -->
    <p
      v-if="loading && !list.length"
      class="library__loading"
    >
      Chargement…
    </p>

    <LibraryEmpty v-else-if="!list.length" />

    <ul
      v-else
      class="library__grid"
    >
      <li
        v-for="session in list"
        :key="session.id"
      >
        <LibraryCard
          :session="session"
          :current="session.id === newest"
        />
      </li>
    </ul>

    <footer class="library__foot">
      <p
        v-if="importError"
        class="library__error"
        role="alert"
      >
        {{ importError }}
      </p>

      <button
        type="button"
        class="library__action"
        :disabled="importing"
        @click="fileInput?.click()"
      >
        <span
          class="library__plus"
          aria-hidden="true"
        />
        {{ importing ? 'Import en cours…' : 'Nouvelle image' }}
      </button>

      <!-- `capture` volontairement absent : on veut le choix entre la pellicule et
           l'appareil photo, et non forcer la prise de vue immédiate. -->
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="sr-only"
        @change="pickImage"
      >
    </footer>

    <ClientOnly>
      <AppInstallBanner />
    </ClientOnly>

    <LibraryMenu
      v-if="menuOpen"
      @close="menuOpen = false"
    />
  </div>
</template>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;
  /* La barre d'état système occupe le haut : on lui laisse sa place plutôt que de
     la redessiner. */
  padding-block-start: calc(var(--safe-top) + var(--sp-8));
}

.library__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: .625rem var(--sp-5) 1.125rem;
}

.library__title {
  font-size: 1.75rem;
  font-weight: var(--fw-bold);
  letter-spacing: -.02em;
}

.library__menu {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: var(--touch-min);
  block-size: var(--touch-min);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background-color: #18181B;
}

.library__bars {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.library__bars span {
  inline-size: 1rem;
  block-size: 2px;
  border-radius: var(--r-pill);
  background-color: var(--text);
}

.library__loading {
  padding-inline: var(--sp-5);
  color: var(--text-faint);
}

.library__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-4);
  align-content: start;
  padding-inline: var(--sp-5);
}

.library__foot {
  position: sticky;
  inset-block-end: 0;
  margin-block-start: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5) calc(var(--safe-bottom) + var(--sp-5));
  /* Dégradé de masquage : la grille défile dessous et doit s'effacer, pas se
     couper net sous le bouton. */
  background: linear-gradient(180deg, transparent, var(--bg) 34%);
}

.library__error {
  font-size: var(--fs-label);
  color: var(--text);
}

.library__action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  min-block-size: 3.5rem;
  border-radius: var(--r-lg);
  background-color: var(--accent);
  color: var(--on-accent);
  font-size: var(--fs-action);
  font-weight: var(--fw-semibold);
  box-shadow: 0 8px 24px rgb(110 86 248 / 38%);
}

.library__action:disabled {
  opacity: .6;
}

.library__plus {
  position: relative;
  inline-size: 1rem;
  block-size: 1rem;
}

.library__plus::before,
.library__plus::after {
  content: '';
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  translate: -50% -50%;
  background-color: currentcolor;
}

.library__plus::before {
  inline-size: 1rem;
  block-size: 2px;
}

.library__plus::after {
  inline-size: 2px;
  block-size: 1rem;
}
</style>
