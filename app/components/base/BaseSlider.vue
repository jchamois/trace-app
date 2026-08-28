<script setup lang="ts">
/**
 * Curseur de réglage. `<input type="range">` habillé plutôt que reconstruit : on
 * hérite du clavier (flèches, Origine/Fin), du rôle ARIA et du pas, qu'une version
 * en `<div>` devrait réimplémenter au complet pour au mieux le même résultat.
 */
const { label, min, max, step = 0.01, format } = defineProps<{
  label: string
  min: number
  max: number
  step?: number
  /** Rend la valeur affichée. Le brut est rarement lisible (0,38 ; + 0,6 ; ×1,2). */
  format: (value: number) => string
}>()

const value = defineModel<number>({ required: true })

const id = useId()

/** Progression 0 → 1, pour peindre la portion remplie de la piste. */
const filled = computed(() => (value.value - min) / (max - min))
</script>

<template>
  <div class="slider">
    <div class="slider__head">
      <label
        class="slider__label"
        :for="id"
      >{{ label }}</label>
      <output
        class="slider__value"
        :for="id"
      >{{ format(value) }}</output>
    </div>

    <input
      :id="id"
      v-model.number="value"
      type="range"
      class="slider__input"
      :min="min"
      :max="max"
      :step="step"
      :style="{ '--filled': `${filled * 100}%` }"
    >
  </div>
</template>

<style scoped>
.slider {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.slider__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
}

.slider__label {
  font-size: var(--fs-label);
}

.slider__value {
  font-family: var(--font-mono);
  font-size: var(--fs-label);
  color: var(--accent);
}

/* Rangée de 48 px pour la cible tactile, alors que la piste n'en fait que 6 :
   c'est la hauteur du contrôle, pas celle de son dessin. */
.slider__input {
  inline-size: 100%;
  block-size: var(--touch-min);
  margin: 0;
  background: none;
  appearance: none;
  touch-action: none;
}

.slider__input::-webkit-slider-runnable-track {
  block-size: .375rem;
  border-radius: var(--r-pill);
  /* La portion remplie est peinte dans la piste : deux éléments superposés
     désynchroniseraient le remplissage du pouce d'un pixel ou deux. */
  background: linear-gradient(
    to right,
    var(--accent) var(--filled),
    #2A2A2F var(--filled)
  );
}

.slider__input::-moz-range-track {
  block-size: .375rem;
  border-radius: var(--r-pill);
  background: linear-gradient(
    to right,
    var(--accent) var(--filled),
    #2A2A2F var(--filled)
  );
}

.slider__input::-webkit-slider-thumb {
  appearance: none;
  inline-size: 1.875rem;
  block-size: 1.875rem;
  /* Recentre le pouce sur une piste de 6 px : (30 − 6) / 2. */
  margin-block-start: -.75rem;
  border: none;
  border-radius: var(--r-pill);
  background-color: #F2F1EE;
  box-shadow: var(--shadow-thumb);
}

.slider__input::-moz-range-thumb {
  inline-size: 1.875rem;
  block-size: 1.875rem;
  border: none;
  border-radius: var(--r-pill);
  background-color: #F2F1EE;
  box-shadow: var(--shadow-thumb);
}
</style>
