<script setup lang="ts">
/**
 * Sauvegarder et restaurer — la seule entrée de l'application qui touche à des
 * fichiers, et le seul endroit où une donnée vient de l'extérieur.
 *
 * Il n'y a **ni compte ni connexion** dans trace-app : l'archive tient ce rôle.
 * Elle porte les calages et les réglages, donc elle restaure des tracés en cours.
 */
import { archiveName, ArchiveError, exportLibrary, mergeSessions, readArchive } from '~/utils/libraryArchive'

const emit = defineEmits<{ close: [] }>()

const { list, put, refresh } = useSessions()

/* L'entrée permanente qui manquait. Le bandeau d'installation est saisonnier — il
   se refuse, et il n'existe pas sur iOS ; ici l'action reste atteignable. */
const { canInstall, installed, isIOS, install } = useInstallPrompt()

const startInstall = async () => {
  await install()
  // Sur iOS, `install()` ouvre la feuille d'instructions : ce menu doit s'effacer
  // devant elle. Ailleurs, l'invite native s'affiche par-dessus de toute façon.
  emit('close')
}

type Outcome
  = | { kind: 'idle' }
    | { kind: 'working', label: string }
    | { kind: 'done', message: string }
    | { kind: 'error', message: string }

const outcome = ref<Outcome>({ kind: 'idle' })
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const save = async () => {
  if (!list.value.length) {
    outcome.value = { kind: 'error', message: 'Il n’y a encore aucun tracé à sauvegarder.' }
    return
  }

  outcome.value = { kind: 'working', label: 'Préparation de l’archive…' }

  try {
    const blob = await exportLibrary(list.value)
    const url = URL.createObjectURL(blob)

    /* Téléchargement plutôt que la File System Access API : celle-ci est absente de
       Safari et de Firefox, alors que le couple `<a download>` + `<input type=file>`
       fonctionne partout. */
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = archiveName(new Date())
    anchor.click()
    URL.revokeObjectURL(url)

    const count = list.value.length
    outcome.value = {
      kind: 'done',
      message: `${count} tracé${count > 1 ? 's' : ''} exporté${count > 1 ? 's' : ''}.`,
    }
  }
  catch {
    outcome.value = { kind: 'error', message: 'La sauvegarde a échoué. Réessaie.' }
  }
}

const restore = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Réinitialisé tout de suite : sans ça, réimporter le même fichier n'émettrait
  // aucun `change` et le bouton paraîtrait mort.
  input.value = ''
  if (!file) return

  outcome.value = { kind: 'working', label: 'Lecture de l’archive…' }

  try {
    const merge = mergeSessions(list.value, await readArchive(file))
    /* `touch: false` : l'horodatage de l'archive fait foi, c'est lui qui vient
       d'arbitrer la fusion. Le redater ici annulerait la décision. */
    await Promise.all(merge.write.map(session => put(session, { touch: false })))
    await refresh()

    const parts: string[] = []
    if (merge.added) parts.push(`${merge.added} ajouté${merge.added > 1 ? 's' : ''}`)
    if (merge.updated) parts.push(`${merge.updated} mis à jour`)
    if (merge.kept) parts.push(`${merge.kept} déjà à jour`)

    outcome.value = {
      kind: 'done',
      message: parts.length ? `${parts.join(', ')}.` : 'Cette archive ne contient aucun tracé.',
    }
  }
  catch (error) {
    // `ArchiveError` porte une phrase écrite pour être lue ; le reste, non.
    outcome.value = {
      kind: 'error',
      message: error instanceof ArchiveError
        ? error.message
        : 'La restauration a échoué. Le fichier est peut-être incomplet.',
    }
  }
}
</script>

<template>
  <BaseSheet
    title="Sauvegarder"
    scrim
    @close="emit('close')"
  >
    <p class="intro">
      Tes tracés vivent uniquement sur cet appareil. Exporte-les dans un fichier pour
      les mettre à l’abri, ou les reprendre sur un autre téléphone.
    </p>

    <div class="actions">
      <button
        v-if="canInstall"
        type="button"
        class="actions__secondary"
        @click="startInstall"
      >
        {{ isIOS ? 'Ajouter à l’écran d’accueil' : 'Installer l’application' }}
      </button>

      <p
        v-else-if="installed"
        class="actions__installed"
      >
        Application installée sur cet appareil.
      </p>

      <button
        type="button"
        class="actions__primary"
        :disabled="outcome.kind === 'working'"
        @click="save"
      >
        Sauvegarder la bibliothèque
      </button>

      <button
        type="button"
        class="actions__secondary"
        :disabled="outcome.kind === 'working'"
        @click="fileInput?.click()"
      >
        Restaurer depuis une archive
      </button>

      <input
        ref="fileInput"
        type="file"
        accept=".zip,application/zip"
        class="sr-only"
        @change="restore"
      >
    </div>

    <p
      v-if="outcome.kind !== 'idle'"
      class="outcome"
      :class="`outcome--${outcome.kind}`"
      role="status"
    >
      {{ outcome.kind === 'working' ? outcome.label : outcome.message }}
    </p>

    <p class="note">
      Une restauration ne remplace jamais un tracé plus récent déjà présent ici, et
      réimporter deux fois la même archive ne crée pas de doublon.
    </p>
  </BaseSheet>
</template>

<style scoped>
.intro {
  line-height: 1.55;
  color: var(--text-dim);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.actions__primary,
.actions__secondary {
  min-block-size: 3.5rem;
  border-radius: var(--r-lg);
  font-size: var(--fs-action);
  font-weight: var(--fw-semibold);
}

.actions__primary {
  background-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 8px 24px rgb(110 86 248 / 38%);
}

.actions__secondary {
  border: 1px solid var(--line);
  background-color: #18181B;
}

.actions__primary:disabled,
.actions__secondary:disabled {
  opacity: .5;
}

.outcome {
  padding: var(--sp-3) var(--sp-4);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-md);
  background-color: #141417;
  font-size: var(--fs-label);
  line-height: 1.5;
}

.outcome--done {
  border-color: rgb(110 86 248 / 45%);
  color: var(--text);
}

.outcome--error {
  color: var(--text);
}

.outcome--working {
  color: var(--text-dim);
}

.actions__installed {
  display: flex;
  align-items: center;
  min-block-size: 3.5rem;
  padding-inline: var(--sp-4);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-lg);
  font-size: var(--fs-label);
  color: var(--text-faint);
}

.note {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-faint);
}
</style>
