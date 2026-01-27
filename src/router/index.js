import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

import { ADMIN_ENABLED } from '@/lib/adminConfig'
import { getPostMetaBySlug } from '@/lib/posts'

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

const SITE_TITLE = 'MarshVer的个人博客'
const SITE_DESC = 'MarshVer 的个人博客，记录技术笔记、折腾与日常。'

function setMetaByName(name, content) {
  const el = document.querySelector(`meta[name="${CSS.escape(name)}"]`)
  if (el) el.setAttribute('content', String(content || ''))
}

function setMetaByProperty(property, content) {
  const el = document.querySelector(`meta[property="${CSS.escape(property)}"]`)
  if (el) el.setAttribute('content', String(content || ''))
}

router.afterEach((to) => {
  let title = SITE_TITLE
  let desc = SITE_DESC

  if (to.name === 'archives') title = `归档 - ${SITE_TITLE}`
  else if (to.name === 'admin') title = `管理 - ${SITE_TITLE}`
  else if (to.name === 'post') {
    const slugParam = Array.isArray(to.params?.slug) ? to.params.slug[0] : to.params?.slug
    const slug = String(slugParam || '').trim()
    const meta = getPostMetaBySlug(slug)
    if (meta?.title) {
      title = `${meta.title} - ${SITE_TITLE}`
      desc = String(meta.excerpt || '').trim() || SITE_DESC
    } else {
      title = `文章不存在 - ${SITE_TITLE}`
      desc = '文章不存在，请检查链接。'
    }
  } else if (to.name === 'not-found') title = `404 - ${SITE_TITLE}`

  document.title = title

  setMetaByName('description', desc)
  setMetaByProperty('og:title', title)
  setMetaByProperty('og:description', desc)
  setMetaByProperty('og:url', window.location.href)
})

export default router
