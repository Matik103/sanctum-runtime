#!/usr/bin/env node
import { BLOG_POSTS } from '../src/lib/blog-posts.ts'

const base = 'https://www.sanctumruntime.com/blog/'
const batch = 15
const requestTimeoutMs = 15_000
const bad = []

async function check(slug) {
  const url = base + slug
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal })
    const text = await res.text()
    const soft404 = /Post not found|This article could not be found|missing-post/i.test(text)
    const redirected = res.redirected || res.url !== url
    if (res.status !== 200 || soft404 || redirected) {
      bad.push({
        slug,
        status: res.status,
        soft404,
        ...(redirected ? { redirectedTo: res.url } : {}),
      })
    }
  } catch (e) {
    bad.push({ slug, status: 'ERR', soft404: String(e) })
  } finally {
    clearTimeout(timer)
  }
}

const slugs = BLOG_POSTS.map((p) => p.slug)
for (let i = 0; i < slugs.length; i += batch) {
  await Promise.all(slugs.slice(i, i + batch).map(check))
  process.stdout.write('.')
}
console.log(`\nChecked ${slugs.length}. Bad: ${bad.length}`)
for (const b of bad) console.log(JSON.stringify(b))
