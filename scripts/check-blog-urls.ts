#!/usr/bin/env node
import { BLOG_POSTS } from '../src/lib/blog-posts.ts'

const base = 'https://www.sanctumruntime.com/blog/'
const batch = 15
const bad = []

async function check(slug) {
  const url = base + slug
  try {
    const res = await fetch(url, { redirect: 'follow' })
    const text = await res.text()
    const soft404 = /Post not found|This article could not be found|missing-post/i.test(text)
    if (res.status !== 200 || soft404) bad.push({ slug, status: res.status, soft404 })
  } catch (e) {
    bad.push({ slug, status: 'ERR', soft404: String(e) })
  }
}

const slugs = BLOG_POSTS.map((p) => p.slug)
for (let i = 0; i < slugs.length; i += batch) {
  await Promise.all(slugs.slice(i, i + batch).map(check))
  process.stdout.write('.')
}
console.log(`\nChecked ${slugs.length}. Bad: ${bad.length}`)
for (const b of bad) console.log(JSON.stringify(b))
