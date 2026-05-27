import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { BlogConsoleCta } from '@/components/BlogConsoleCta'
import { BLOG_ANSWER_POSTS } from '@/lib/blog-answers'
import { blogPostPath, getBlogPost } from '@/lib/blog-posts'
import { articleJsonLd, pageSeo } from '@/lib/seo'
import { docsPath } from '@/lib/site-links'

function faqJsonLd(slug: string) {
  const content = BLOG_ANSWER_POSTS[slug]
  if (!content) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: content.answers.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }
}

export const Route = createFileRoute('/blog/$slug')({
  component: PostPage,
  head: ({ params }) => {
    const post = getBlogPost(params.slug)
    if (!post) return {}
    const faq = faqJsonLd(params.slug)
    return {
      ...pageSeo({
        title: `${post.title} — Sanctum`,
        description: post.description,
        path: blogPostPath(params.slug),
        ogType: 'article',
      }),
      scripts: [
        { type: 'application/ld+json', children: JSON.stringify(articleJsonLd(post)) },
        ...(faq ? [{ type: 'application/ld+json', children: JSON.stringify(faq) }] : []),
      ],
    }
  },
})

function PostPage() {
  const { slug } = Route.useParams()
  const post = getBlogPost(slug)
  const content = BLOG_ANSWER_POSTS[slug]

  if (!post || !content) {
    return (
      <BlogLayout
        post={{
          slug: 'missing-post',
          title: 'Post not found',
          description: 'This article is not available yet.',
          publishedAt: '2026-05-27',
          tags: ['blog'],
          readTime: 1,
        }}
      >
        <p>This article could not be found.</p>
        <p>
          Browse the{' '}
          <Link to="/blog/" className="text-primary hover:underline">
            full blog index
          </Link>{' '}
          or read the{' '}
          <Link to={docsPath} className="text-primary hover:underline">
            docs
          </Link>
          .
        </p>
      </BlogLayout>
    )
  }

  return (
    <BlogLayout post={post} showConsoleCta={false}>
      <p>{content.intro}</p>
      <h2>Key takeaways</h2>
      <ul>
        {content.keyPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      <h2>Implementation checklist</h2>
      <ol>
        {content.checklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>

      <h2>People also ask</h2>
      {content.answers.map((item) => (
        <div key={item.question}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </div>
      ))}

      <BlogConsoleCta slug={slug} />

      <p className="!mt-8">
        Related:{' '}
        {content.related.map((slugItem, index) => (
          <span key={slugItem}>
            <Link to={blogPostPath(slugItem)} className="text-primary hover:underline">
              {getBlogPost(slugItem)?.title ?? slugItem}
            </Link>
            {index < content.related.length - 1 ? ', ' : '.'}
          </span>
        ))}
      </p>
    </BlogLayout>
  )
}
