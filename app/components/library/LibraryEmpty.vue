<script setup lang="ts">
/**
 * Le premier lancement. Il n'annonce pas la fonctionnalité, il annonce le
 * **prérequis matériel** : sans support pour fixer le téléphone au-dessus de la
 * feuille, l'image bouge à chaque respiration et l'application paraît cassée. Dit
 * ici, l'échec ne sera pas imputé au logiciel.
 */
defineEmits<{ help: [] }>()
</script>

<template>
  <div class="empty">
    <div
      class="empty__figure"
      aria-hidden="true"
    >
      <span class="empty__sheet" />
      <span class="empty__phone" />
      <span class="empty__beam" />
      <span class="empty__target" />
    </div>

    <div class="empty__copy">
      <h2 class="empty__title">
        Aucun tracé pour l’instant
      </h2>
      <p class="empty__text">
        Avant de commencer : fixe ton téléphone sur un support, caméra vers le bas,
        au-dessus de ta feuille. Elle doit tenir entière dans l’image.
      </p>
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.625rem;
  padding-inline: 2.125rem;
  text-align: center;
}

/* Composition géométrique plutôt qu'une illustration bitmap : elle suit les jetons,
   reste nette à toute densité et ne pèse rien dans le précache hors ligne. */
.empty__figure {
  position: relative;
  inline-size: 9.375rem;
  block-size: 11.25rem;
}

.empty__sheet {
  position: absolute;
  inset-block-start: 1.875rem;
  inset-inline-start: 50%;
  translate: -50% 0;
  inline-size: 7.375rem;
  block-size: 9.375rem;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: var(--r-sm);
  background-color: #151517;
}

.empty__phone {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 50%;
  translate: -50% 0;
  inline-size: 4.625rem;
  block-size: 3.25rem;
  border-radius: var(--r-sm);
  background-color: #1E1E22;
}

.empty__beam {
  position: absolute;
  inset-block-start: 3.25rem;
  inset-inline-start: 50%;
  translate: -50% 0;
  inline-size: .25rem;
  block-size: 2.75rem;
  background: linear-gradient(180deg, rgb(110 86 248 / 50%), transparent);
}

.empty__target {
  position: absolute;
  inset-block-start: 5.75rem;
  inset-inline-start: 50%;
  translate: -50% 0;
  inline-size: 1.125rem;
  block-size: 1.125rem;
  border: 2px solid var(--accent);
  border-radius: var(--r-pill);
}

.empty__copy {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.empty__title {
  font-size: 1.3125rem;
  font-weight: var(--fw-semibold);
  letter-spacing: -.02em;
}

.empty__text {
  line-height: 1.55;
  color: var(--text-dim);
}
</style>
