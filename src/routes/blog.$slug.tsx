import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { BlogConsoleCta } from '@/components/BlogConsoleCta'
import { BlogRelatedGuides } from '@/components/BlogRelatedGuides'
import { getExpandedSections } from '@/lib/blog-expanded-sections'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'
import { blogIndexPath, blogPostPath, getBlogAnswerPost, getBlogPost } from '@/lib/blog-posts'
import { getRelatedSlugs } from '@/lib/blog-related'
import { docsPath } from '@/lib/site-links'

function faqJsonLd(slug: string) {
  const content = getBlogAnswerPost(slug)
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
  beforeLoad: ({ params }) => {
    if (!getBlogPost(params.slug)) {
      throw notFound()
    }
  },
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
  const content = getBlogAnswerPost(slug)
  const expanded = getExpandedSections(slug)
  const seo = post ? getBlogPostSeo(slug, post) : null

  if (!post || !content) {
    throw notFound()
  }

  const displayPost = seo ? { ...post, title: seo.displayTitle, description: seo.description } : post

  return (
    <BlogLayout post={displayPost} slug={slug} showConsoleCta={false} showRelatedGuides={false}>
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
      <BlogRelatedGuides slug={slug} relatedSlugs={getRelatedSlugs(slug)} />
    </BlogLayout>
  )
}
