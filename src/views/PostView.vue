<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MarkdownIt from 'markdown-it'
import { getAllPosts, getPostBySlug, postsRevision } from '@/lib/posts'

const route = useRoute()

const slug = computed(() => String(route.params.slug || ''))
const post = computed(() => {
  postsRevision.value
  return getPostBySlug(slug.value)
})

const allPosts = computed(() => {
  postsRevision.value
  return getAllPosts()
})
const postIndex = computed(() => allPosts.value.findIndex((p) => p.slug === slug.value))
// All posts are sorted DESC by date in getAllPosts().
const prevPost = computed(() => (postIndex.value > 0 ? allPosts.value[postIndex.value - 1] : null))
const nextPost = computed(() =>
  postIndex.value >= 0 && postIndex.value < allPosts.value.length - 1
    ? allPosts.value[postIndex.value + 1]
    : null,
)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

const html = computed(() => (post.value ? md.render(post.value.content) : ''))
</script>

<template>
  <div>
    <div v-if="!post" class="post-block empty-block">
      <h1 class="post-title">文章不存在</h1>
      <div class="post-excerpt">请检查链接，或返回首页查看文章列表。</div>
      <router-link class="post-more" to="/">返回首页 »</router-link>
    </div>

    <article v-else class="post-block post-single">
      <header>
        <h1 class="post-title">{{ post.title }}</h1>
        <div class="post-meta">
          <time :datetime="post.date">{{ post.date }}</time>
        </div>
      </header>

      <div class="markdown" v-html="html" />

      <nav v-if="prevPost || nextPost" class="post-nav" aria-label="Post navigation">
        <router-link
          v-if="prevPost"
          class="post-nav__item post-nav__item--prev"
          :to="{ name: 'post', params: { slug: prevPost.slug } }"
        >
          上一篇：{{ prevPost.title }}
        </router-link>
        <router-link
          v-if="nextPost"
          class="post-nav__item post-nav__item--next"
          :to="{ name: 'post', params: { slug: nextPost.slug } }"
        >
          下一篇：{{ nextPost.title }}
        </router-link>
      </nav>
    </article>
  </div>
</template>
