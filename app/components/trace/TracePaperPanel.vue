<script setup lang="ts">
/**
 * Calibration papier : déclarer le format sous le téléphone, et lire ce que le
 * sujet mesurera réellement une fois tracé.
 *
 * Une fois les quatre poignées posées sur les coins de la feuille, le carré unité
 * **est** la feuille : le format suffit alors à convertir n'importe quelle mesure
 * de l'écran en centimètres.
 */
import { formatCm, subjectSizeCm } from '~/utils/paper'
import type { PaperFormat, TraceSession } from '~/utils/session'
import { PAPER_LABELS, PAPER_SIZES } from '~/utils/session'

const session = defineModel<TraceSession>({ required: true })

const { imageSize } = defineProps<{ imageSize: { w: number, h: number } }>()

const emit = defineEmits<{ close: [] }>()

const FORMATS = Object.keys(PAPER_LABELS) as PaperFormat[]

const subject = computed(() =>
  subjectSizeCm(session.value.paperSizeCm, imageSize, session.value.targetWidthCm),
)

const pickFormat = (format: PaperFormat) => {
  session.value.paperFormat = format
  // « Libre » conserve les dimensions courantes comme point de départ : elles sont
  // plus proches de la vérité qu'un défaut arbitraire.
  if (format !== 'free') session.value.paperSizeCm = { ...PAPER_SIZES[format] }
}

/** Champ de saisie séparé du modèle : une frappe intermédiaire vide n'est pas 0. */
const targetInput = ref(
  session.value.targetWidthCm === null ? '' : String(session.value.targetWidthCm),
)

watch(targetInput, (raw) => {
  const value = Number.parseFloat(raw.replace(',', '.'))
  session.value.targetWidthCm = Number.isFinite(value) && value > 0 ? value : null
})

/* Repartir d'un calage devenu illisible à force d'ajustements. On efface plutôt que
   de recalculer : le défaut dépend des proportions du viewport, que seul l'écran de
   travail connaît, et c'est lui qui le repose. */
const reset = () => {
  session.value.corners = null
  session.value.mode = 'quad'
}
</script>

<template>
  <BaseSheet
    title="Calibration papier"
    @close="emit('close')"
  >
    <fieldset class="formats">
      <legend class="formats__legend">
        Format de la feuille
      </legend>

      <div class="formats__grid">
        <label
          v-for="format in FORMATS"
          :key="format"
          class="formats__tile"
          :class="{ 'formats__tile--on': session.paperFormat === format }"
        >
          <input
            type="radio"
            name="paper-format"
            class="sr-only"
            :value="format"
            :checked="session.paperFormat === format"
            @change="pickFormat(format)"
          >
          {{ PAPER_LABELS[format] }}
        </label>
      </div>
    </fieldset>

    <div class="measure">
      <h3 class="measure__title">
        Dimensions réelles du sujet
      </h3>

      <p class="measure__value">
        <output class="measure__number">{{ formatCm(subject.w) }}</output>
        <span class="measure__rest">× {{ formatCm(subject.h) }} cm</span>
      </p>

      <div class="measure__target">
        <label
          for="target-width"
          class="measure__label"
        >Taille cible (largeur)</label>

        <span class="measure__field">
          <input
            id="target-width"
            v-model="targetInput"
            type="text"
            inputmode="decimal"
            class="measure__input"
            placeholder="auto"
          >
          <span class="measure__unit">cm</span>
        </span>
      </div>

      <p class="measure__note">
        L’image est mise à l’échelle sur la feuille calée. Le ratio est conservé.
      </p>
    </div>

    <div class="actions">
      <button
        type="button"
        class="actions__reset"
        @click="reset"
      >
        Recaler
      </button>

      <button
        type="button"
        class="actions__apply"
        @click="emit('close')"
      >
        Appliquer
      </button>
    </div>
  </BaseSheet>
</template>

<style scoped>
.formats {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  border: none;
}

.formats__legend {
  padding: 0;
  font-size: var(--fs-label);
}

.formats__grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--sp-2);
}

.formats__tile {
  display: grid;
  place-items: center;
  block-size: 3.25rem;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background-color: var(--surface-2);
  font-size: .8125rem;
  cursor: pointer;
}

.formats__tile--on {
  border-color: transparent;
  background-color: var(--accent);
  color: var(--on-accent);
  font-weight: var(--fw-bold);
}

.formats__tile:has(:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.measure {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-lg);
  background-color: #141417;
}

.measure__title {
  font-family: var(--font-mono);
  font-size: .6875rem;
  font-weight: var(--fw-regular);
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--text-faint);
}

.measure__value {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
}

.measure__number {
  font-family: var(--font-mono);
  font-size: 2.125rem;
  color: var(--accent);
}

.measure__rest {
  color: var(--text-dim);
}

.measure__target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding-block-start: var(--sp-3);
  border-block-start: 1px solid var(--line-soft);
}

.measure__label {
  font-size: var(--fs-label);
}

.measure__field {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  block-size: var(--touch-min);
  padding-inline: var(--sp-3);
  border: 1px solid var(--accent);
  border-radius: var(--r-md);
  background-color: var(--surface-sunk);
}

.measure__input {
  inline-size: 4ch;
  font-family: var(--font-mono);
  font-size: var(--fs-action);
  text-align: end;
}

.measure__unit {
  font-family: var(--font-mono);
  font-size: .8125rem;
  color: var(--text-faint);
}

.measure__note {
  font-size: .8125rem;
  line-height: 1.5;
  color: var(--text-faint);
}

.actions {
  display: flex;
  gap: var(--sp-3);
}

.actions__reset,
.actions__apply {
  min-block-size: 3.5rem;
  border-radius: var(--r-lg);
  font-size: var(--fs-action);
  font-weight: var(--fw-semibold);
}

.actions__reset {
  flex: 1;
  border: 1px solid var(--line);
  background-color: #18181B;
}

.actions__apply {
  flex: 1.4;
  background-color: var(--accent);
  color: var(--on-accent);
}
</style>
