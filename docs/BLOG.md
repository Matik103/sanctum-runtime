# Blog — writing for discoverability

Public index: **https://www.sanctumruntime.com/blog**

## Add a new post

1. Add metadata to `src/lib/blog-posts.ts` (`slug`, `title`, `description`, `tags`, `publishedAt`, `readTime`).
2. Create `src/routes/blog/<slug>.tsx` using an existing post as template (`BlogLayout` + `articleJsonLd` + `pageSeo`).
3. Run `npm run generate:sitemap` and commit updated `public/sitemap.xml`.
4. Add the URL to `public/llms.txt` under **Blog**.
5. Deploy marketing site (Vercel).
6. Google Search Console → URL inspection → Request indexing.

## SEO checklist per post

- Title includes primary keyword (e.g. “AI agent action approval”).
- Meta description 140–160 chars, unique.
- 2+ internal links (docs, glossary, other blog posts).
- One code sample or bullet list for skimmability.
- Tags match GitHub topics / npm keywords where possible.

## Target keyword themes

| Theme | Example slug |
|-------|----------------|
| Runtime trust | `runtime-trust-layer-for-ai-agents` |
| Agent tools | `ai-agent-action-approval-before-execution` |
| Robotics / embodied | `embodied-ai-robotics-policy-gate` |
| vs guardrails | `sanctum-vs-guardrails` |
| Mobile / HITL | `mobile-pwa-runtime-verification` |
| MCP / LangChain | *(future)* `mcp-server-action-gate` |
| ROS2 | *(future)* `ros2-safety-policy-runtime` |

## Do not

- Publish console or API docs as blog — keep `console` noindex.
- Duplicate README verbatim — summarize and link to GitHub.
