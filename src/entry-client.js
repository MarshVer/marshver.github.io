import { createApp } from './app'

const { app, router } = createApp()

router.isReady().then(() => {
  // createSSRApp() hydrates when markup already exists (SSG/SSR output).
  app.mount('#app')
})

