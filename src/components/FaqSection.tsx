import { Link } from '@tanstack/react-router'
import { docsPath } from '@/lib/site-links'

const faqs = [
  {
    q: 'What is Sanctum Runtime?',
    a: 'A trusted execution layer between AI reasoning and real-world actions. It approves, holds for human verification, or blocks every high-stakes action — with policies and audit.',
  },
  {
    q: 'How is this different from guardrails?',
    a: 'Guardrails protect chat. Sanctum protects execution — emails, APIs, files, doors, and robot commands before they run.',
  },
  {
    q: 'What can I gate with Sanctum?',
    a: 'Any action your system can name: agent tools, ROS2 commands, smart home devices, industrial PLCs, workflow steps, and more.',
  },
  {
    q: 'Does it work offline?',
    a: 'Yes. Open-core runtime supports offline heuristics and local Ollama risk scoring for edge and sovereign deploys.',
  },
]

export function FaqSection() {
  return (
    <section id="faq" className="relative py-24 md:py-32 border-t border-border">
      <div className="container mx-auto px-6 max-w-3xl">
        <div className="text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">FAQ</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold">Common questions</h2>
        </div>
        <dl className="mt-12 space-y-8">
          {faqs.map(({ q, a }) => (
            <div key={q}>
              <dt className="text-lg font-semibold text-foreground">{q}</dt>
              <dd className="mt-2 text-muted-foreground leading-relaxed">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-center text-sm text-muted-foreground">
          <Link to="/blog/" className="text-primary hover:underline">
            Read the blog
          </Link>
          {' · '}
          <Link to={docsPath} className="text-primary hover:underline">
            Full documentation
          </Link>
        </p>
      </div>
    </section>
  )
}
