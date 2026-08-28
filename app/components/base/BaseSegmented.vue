<script setup lang="ts">
/**
 * Sélecteur segmenté. Bâti sur de vrais boutons radio dans un `<fieldset>` : le
 * groupe est annoncé par sa légende, et les flèches naviguent entre les options
 * sans code. Une rangée de `<button>` perdrait les deux.
 */
const { legend, options } = defineProps<{
  legend: string
  options: readonly { value: string, label: string }[]
}>()

const value = defineModel<string>({ required: true })

const name = useId()
</script>

<template>
  <fieldset class="segmented">
    <legend class="segmented__legend">
      {{ legend }}
    </legend>

    <div class="segmented__track">
      <label
        v-for="option in options"
        :key="option.value"
        class="segmented__item"
        :class="{ 'segmented__item--on': value === option.value }"
      >
        <input
          v-model="value"
          type="radio"
          class="sr-only"
          :name="name"
          :value="option.value"
        >
        {{ option.label }}
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.segmented {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  border: none;
}

.segmented__legend {
  padding: 0;
  font-size: var(--fs-label);
}

.segmented__track {
  display: grid;
  grid-auto-columns: 1fr;
  grid-auto-flow: column;
  padding: var(--sp-1);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background-color: var(--surface-2);
}

.segmented__item {
  display: grid;
  place-items: center;
  block-size: 2.75rem;
  border-radius: var(--r-md);
  color: var(--text-dim);
  font-size: var(--fs-label);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}

.segmented__item--on {
  background-color: var(--accent);
  color: var(--on-accent);
  font-weight: var(--fw-semibold);
}

/* Le focus vit sur l'input masqué : sans cette remontée, la navigation au clavier
   serait invisible. */
.segmented__item:has(:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
