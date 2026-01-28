import { renderToString } from '@vue/server-renderer'

import { createApp } from './app'
import { applyInitialState, resetPostsState } from '@/lib/posts'

export async function render(url, initialState = null) {
  resetPostsState()
  if (initialState) applyInitialState(initialState)

  const { app, router } = createApp()

  router.push(url)
  await router.isReady()

  const ctx = {}
  const html = await renderToString(app, ctx)
  return { html, modules: ctx.modules || new Set() }
}
