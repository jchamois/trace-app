<script setup lang="ts">
import { PAPER_LABELS } from '~/utils/session'
import type { TraceSession } from '~/utils/session'

const { session, current = false } = defineProps<{ session: TraceSession, current?: boolean }>()

const thumb = useObjectUrl(() => session.thumb)

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

const meta = computed(() =>
  `${PAPER_LABELS[session.paperFormat]} · ${DATE_FORMAT.format(session.updatedAt)}`,
)
</script>

<template>
  <NuxtLink
    :to="`/trace/${session.id}`"
    class="card"
  >
    <span class="card__frame">
      <!-- `alt` vide : la vignette est un aperçu du tracé, le nom juste dessous
           porte déjà l'information. La décrire deux fois alourdirait la liste. -->
      <img
        v-if="thumb"
        :src="thumb"
        alt=""
        class="card__thumb"
        width="420"
        height="594"
        loading="lazy"
      >

      <span
        v-if="current"
        class="card__dot"
      >
        <span class="sr-only">Tracé en cours</span>
      </span>
    </span>

    <span class="card__name">{{ session.name }}</span>
    <time
      class="card__meta"
      :datetime="new Date(session.updatedAt).toISOString()"
    >{{ meta }}</time>
  </NuxtLink>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.card__frame {
  position: relative;
  display: block;
  aspect-ratio: 1 / 1.414;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: var(--r-md);
  background-color: var(--surface);
}

.card__thumb {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.card__dot {
  position: absolute;
  inset-block-start: var(--sp-2);
  inset-inline-end: var(--sp-2);
  inline-size: .5rem;
  block-size: .5rem;
  border-radius: var(--r-pill);
  background-color: var(--accent);
}

.card__name {
  font-size: var(--fs-label);
  font-weight: var(--fw-medium);
  /* Un nom long ne doit pas désaligner la grille. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__meta {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  color: var(--text-faint);
}
</style>
