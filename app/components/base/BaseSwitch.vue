<script setup lang="ts">
/**
 * Interrupteur. `role="switch"` avec `aria-checked` plutôt qu'une case à cocher
 * habillée : « activé / désactivé » est ce que le lecteur d'écran doit annoncer,
 * pas « coché ».
 */
defineProps<{ label: string }>()

const value = defineModel<boolean>({ required: true })
</script>

<template>
  <div class="row">
    <span
      :id="`${$.uid}-label`"
      class="row__label"
    >{{ label }}</span>

    <button
      type="button"
      class="switch"
      role="switch"
      :aria-checked="value"
      :aria-labelledby="`${$.uid}-label`"
      @click="value = !value"
    >
      <span
        class="switch__knob"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  min-block-size: var(--touch-min);
}

.row__label {
  font-size: var(--fs-label);
}

.switch {
  position: relative;
  flex: none;
  inline-size: 3.5rem;
  block-size: 2rem;
  border-radius: var(--r-pill);
  background-color: var(--surface-2);
  transition: background-color var(--dur-fast) var(--ease);
}

.switch[aria-checked='true'] {
  background-color: var(--accent);
}

.switch__knob {
  position: absolute;
  inset-block-start: .1875rem;
  inset-inline-start: .1875rem;
  inline-size: 1.625rem;
  block-size: 1.625rem;
  border-radius: var(--r-pill);
  background-color: #F2F1EE;
  box-shadow: var(--shadow-thumb);
  transition: translate var(--dur-fast) var(--ease);
}

.switch[aria-checked='true'] .switch__knob {
  /* 56 − 26 − 3 × 2 = 24 px de course. */
  translate: 1.5rem 0;
}
</style>
