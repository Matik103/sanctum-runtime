import { consoleUrl } from '@/lib/site-links'
import { getBlogConsoleCta } from '@/lib/blog-console-ctas'
import { consolePageLabel, consolePageUrl, type ConsolePageId } from '@/lib/console-pages'

type Props = {
  slug: string
}

function StepText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="text-foreground/90 font-mono text-[0.9em]">
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function PageLink({ page }: { page: ConsolePageId }) {
  return (
    <a href={consolePageUrl(page)} className="text-primary hover:underline font-medium">
      {consolePageLabel(page)}
    </a>
  )
}

export function BlogConsoleCta({ slug }: Props) {
  const cta = getBlogConsoleCta(slug)
  const base = consoleUrl.replace(/\/$/, '')

  return (
    <aside
      className="not-prose my-10 rounded-xl border border-primary/25 bg-surface/50 p-6 md:p-7"
      aria-labelledby={`console-cta-${slug}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-primary">Try in Sanctum Console</p>
      <h2 id={`console-cta-${slug}`} className="!mt-2 !mb-2 text-xl font-semibold text-foreground">
        {cta.headline}
      </h2>
      <p className="text-sm text-muted-foreground !mt-0">
        Start in <PageLink page={cta.primaryPage} />
        {cta.secondaryPage ? (
          <>
            {' '}
            · then <PageLink page={cta.secondaryPage} />
          </>
        ) : null}
      </p>
      <ol className="mt-4 space-y-2.5 text-sm text-muted-foreground list-decimal pl-5 !mb-0">
        {cta.steps.map((step) => (
          <li key={step} className="leading-relaxed">
            <StepText text={step} />
          </li>
        ))}
      </ol>
      <p className="mt-5 mb-0">
        <a
          href={consolePageUrl(cta.primaryPage)}
          className="inline-flex items-center text-sm font-medium text-primary hover:underline"
        >
          Open console →
        </a>
        <span className="text-muted-foreground text-sm">
          {' '}
          · <a href={base} className="text-primary hover:underline">console home</a>
        </span>
      </p>
    </aside>
  )
}
