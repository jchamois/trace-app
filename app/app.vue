<template>
  <NuxtPage />

  <!-- Hors des pages : le bandeau doit survivre à la navigation entre la
       bibliothèque et l'écran de travail, et `ClientOnly` parce qu'il lit l'état
       du service worker, qui n'existe qu'au navigateur. -->
  <ClientOnly>
    <AppUpdateBanner />
  </ClientOnly>
</template>
