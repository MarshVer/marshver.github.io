<template>
  <div class="post-block empty-block">
    <h1 class="nf__code">404</h1>
    <div class="nf__title">页面不存在</div>
    <div class="nf__desc">你访问的地址不存在，试试返回首页。</div>
    <router-link class="post-more" to="/">返回首页 »</router-link>
  </div>
</template>

<style scoped>
.nf__code {
  margin: 0 0 6px;
  font-size: 44px;
  color: var(--next-heading);
  line-height: 1.1;
}

.nf__title {
  font-weight: 800;
  color: var(--next-heading);
}

.nf__desc {
  margin-top: 10px;
  color: var(--next-muted);
}
</style>
