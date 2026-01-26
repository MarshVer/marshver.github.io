import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

import { ADMIN_ENABLED } from '@/lib/adminConfig'

const enableAdmin = ADMIN_ENABLED

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
  },
  {
    path: '/posts/:slug',
    name: 'post',
    component: () => import('../views/PostView.vue'),
    props: true,
  },
  {
    path: '/archives',
    name: 'archives',
    component: () => import('../views/ArchiveView.vue'),
  },
]

if (enableAdmin) {
  routes.push({
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
  })
}

routes.push({
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: () => import('../views/NotFoundView.vue'),
})

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior() {
    return { top: 0 }
  },
  routes,
})

export default router
