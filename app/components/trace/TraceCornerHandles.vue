<script setup lang="ts">
/**
 * Les quatre poignées de calage et le liseré de la feuille.
 *
 * Purement visuel : les gestes sont captés par la surface au-dessous
 * (`useTraceGestures`), qui possède les coins. Séparer les deux évite qu'un doigt
 * posé entre deux poignées soit avalé par un `<circle>` au lieu de translater
 * l'ensemble.
 */
import type { Pt } from '~/utils/homography'

const { corners, size, active } = defineProps<{
  /** Coins normalisés, dans l'ordre horaire depuis le haut-gauche. */
  corners: readonly Pt[]
  size: { w: number, h: number }
  /** Index de la poignée en cours de saisie, ou `null`. */
  active: number | null
}>()

const points = computed(() => corners.map(c => ({ x: c.x * size.w, y: c.y * size.h })))

const outline = computed(() => points.value.map(p => `${p.x},${p.y}`).join(' '))
</script>

<template>
  <svg
    class="handles"
    :viewBox="`0 0 ${size.w} ${size.h}`"
    aria-hidden="true"
  >
    <polygon
      class="handles__outline"
      :points="outline"
    />

    <g
      v-for="(point, index) in points"
      :key="index"
    >
      <!-- Halo de saisie : dessiné seulement sur la poignée tenue, pour marquer
           l'accroche sans encombrer les trois autres. -->
      <circle
        v-if="active === index"
        class="handles__halo"
        :cx="point.x"
        :cy="point.y"
        r="28"
      />

      <circle
        class="handles__dot"
        :class="{ 'handles__dot--on': active === index }"
        :cx="point.x"
        :cy="point.y"
        :r="active === index ? 22 : 18"
      />

      <!-- Le point central marque le pixel exact sous le doigt : sans lui, on cale
           au jugé sur un disque de 44 px. -->
      <circle
        v-if="active === index"
        class="handles__pin"
        :cx="point.x"
        :cy="point.y"
        r="5"
      />
    </g>
  </svg>
</template>

<style scoped>
.handles {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  /* Les gestes appartiennent à la surface au-dessous. */
  pointer-events: none;
}

.handles__outline {
  fill: none;
  stroke: var(--accent);
  stroke-width: 1.5;
}

.handles__halo {
  fill: var(--accent-halo);
}

.handles__dot {
  fill: var(--scrim);
  stroke: var(--accent);
  stroke-width: 2;
  /* Le second liseré noir est ce qui garde la poignée visible quand elle passe sur
     la feuille blanche surexposée — l'accent seul s'y noierait. */
  paint-order: stroke;
  filter: drop-shadow(0 0 0 rgb(0 0 0 / 60%));
}

.handles__dot--on {
  fill: var(--accent);
}

.handles__pin {
  fill: #FFF;
}
</style>
