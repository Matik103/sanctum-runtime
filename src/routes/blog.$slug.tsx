import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { BlogConsoleCta } from '@/components/BlogConsoleCta'
import { BlogRelatedGuides } from '@/components/BlogRelatedGuides'
import { BLOG_ANSWER_POSTS } from '@/lib/blog-answers'
import { getExpandedSections } from '@/lib/blog-expanded-sections'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'
import { blogPostPath, getBlogPost } from '@/lib/blog-posts'
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
    return blogPostHead(
      params.slug,
      post,
      faq ? [{ type: 'application/ld+json', children: JSON.stringify(faq) }] : [],
    )
  },
})

function PostPage() {
  const { slug } = Route.useParams()
  const post = getBlogPost(slug)
  const content = BLOG_ANSWER_POSTS[slug]
  const expanded = getExpandedSections(slug)
  const seo = post ? getBlogPostSeo(slug, post) : null

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

  const displayPost = seo ? { ...post, title: seo.displayTitle, description: seo.description } : post

  return (
    <BlogLayout post={displayPost} slug={slug} showConsoleCta={false}>
      <p className="text-lg">{content.intro}</p>

      {expanded.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
          {section.bullets && (
            <ul>
              {section.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

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
      <BlogRelatedGuides slug={slug} relatedSlugs={content.related} />
    </BlogLayout>
  )
}
