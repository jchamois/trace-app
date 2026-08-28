<script setup lang="ts">
/**
 * Réglages du calque. Chaque déplacement de curseur repeint immédiatement l'image
 * au-dessus de la feuille : c'est tout l'intérêt du panneau, et c'est pourquoi il
 * ne pose aucun voile assombrissant et ne dépasse jamais 60 % du viewport.
 */
import type { RenderMode, TraceSession } from '~/utils/session'
import { STROKE_COLORS } from '~/utils/session'

const session = defineModel<TraceSession>({ required: true })

const emit = defineEmits<{ close: [] }>()

const RENDERS: { value: RenderMode, label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'edges', label: 'Contours' },
  { value: 'posterize', label: 'Aplats' },
]

const COLOR_LABELS: Record<string, string> = {
  '#111114': 'Noir',
  '#FFFFFF': 'Blanc',
  '#6E56F8': 'Violet',
  '#3B82F6': 'Bleu',
}

const percent = (v: number) => `${Math.round(v * 100)} %`
/** Le contraste est un écart : le signe doit être lisible, `+ 0,6` et non `0,6`. */
const signed = (v: number) => `${v >= 0 ? '+' : '−'} ${Math.abs(v).toFixed(1).replace('.', ',')}`
const decimal = (v: number) => v.toFixed(2).replace('.', ',')
const plain = (v: number) => String(Math.round(v))

/* Le titre de la carte suit le rendu choisi : les curseurs qui suivent n'ont de
   sens que pour lui, et le handoff les fait disparaître plutôt que de les griser. */
const paramsTitle = computed(() => ({
  photo: 'Paramètres · photo',
  edges: 'Paramètres · contours',
  posterize: 'Paramètres · aplats',
}[session.value.render]))
</script>

<template>
  <BaseSheet
    title="Réglages image"
    @close="emit('close')"
  >
    <BaseSlider
      v-model="session.params.opacity"
      label="Opacité"
      :min="0.05"
      :max="1"
      :step="0.01"
      :format="percent"
    />

    <BaseSegmented
      v-model="session.render"
      legend="Rendu"
      :options="RENDERS"
    />

    <div class="params">
      <h3 class="params__title">
        {{ paramsTitle }}
      </h3>

      <BaseSlider
        v-if="session.render === 'edges'"
        v-model="session.params.threshold"
        label="Seuil"
        :min="0.02"
        :max="0.9"
        :step="0.01"
        :format="decimal"
      />

      <BaseSlider
        v-if="session.render === 'posterize'"
        v-model="session.params.levels"
        label="Nombre de niveaux"
        :min="2"
        :max="8"
        :step="1"
        :format="plain"
      />

      <BaseSlider
        v-model="session.params.contrast"
        label="Contraste"
        :min="-0.9"
        :max="2"
        :step="0.1"
        :format="signed"
      />

      <BaseSlider
        v-model="session.params.gamma"
        label="Gamma"
        :min="0.3"
        :max="3"
        :step="0.1"
        :format="decimal"
      />
    </div>

    <BaseSwitch
      v-model="session.invert"
      label="Inverser"
    />

    <fieldset class="colors">
      <legend class="colors__legend">
        Couleur de trait
      </legend>

      <div class="colors__row">
        <label
          v-for="color in STROKE_COLORS"
          :key="color"
          class="colors__swatch"
          :class="{ 'colors__swatch--on': session.strokeColor === color }"
          :style="{ '--swatch': color }"
        >
          <input
            v-model="session.strokeColor"
            type="radio"
            name="stroke-color"
            class="sr-only"
            :value="color"
          >
          <span class="sr-only">{{ COLOR_LABELS[color] }}</span>
        </label>
      </div>
    </fieldset>

    <p
      v-if="session.render === 'photo'"
      class="hint"
    >
      Le rendu « Photo » recouvre la feuille. Pour décalquer, « Contours » laisse voir
      le papier entre les traits.
    </p>
  </BaseSheet>
</template>

<style scoped>
.params {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: 1px solid var(--line-soft);
  border-radius: var(--r-lg);
  background-color: #141417;
}

.params__title {
  font-family: var(--font-mono);
  font-size: .6875rem;
  font-weight: var(--fw-regular);
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--text-faint);
}

.colors {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  border: none;
}

.colors__legend {
  padding: 0;
  font-size: var(--fs-label);
}

.colors__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-block-size: var(--touch-min);
}

.colors__swatch {
  inline-size: 2.125rem;
  block-size: 2.125rem;
  border: 2px solid transparent;
  border-radius: var(--r-pill);
  /* Doublure sombre : le blanc et l'accent doivent rester distincts du fond de la
     feuille glissante, qui est presque noir. */
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 14%);
  background-color: var(--swatch);
  cursor: pointer;
}

.colors__swatch--on {
  border-color: var(--accent);
  /* L'anneau se détache du disque : sans cet écart, une pastille violette
     sélectionnée serait indiscernable d'une non sélectionnée. */
  outline: 2px solid var(--bg);
  outline-offset: -4px;
}

.colors__swatch:has(:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.hint {
  font-size: .8125rem;
  line-height: 1.5;
  color: var(--text-faint);
}
</style>
