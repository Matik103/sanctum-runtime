import { createFileRoute, Link } from '@tanstack/react-router'
import { BlogLayout } from '@/components/BlogLayout'
import { getBlogPost, blogPostPath } from '@/lib/blog-posts'
import { blogPostHead, getBlogPostSeo } from '@/lib/blog-seo'
import { consoleUrl, docsPath, githubUrl } from '@/lib/site-links'

const slug = 'introducing-sanctum-runtime'
const post = getBlogPost(slug)!

export const Route = createFileRoute('/blog/introducing-sanctum-runtime')({
  component: PostPage,
  head: () => blogPostHead(slug, post),
})

function PostPage() {
  const seo = getBlogPostSeo(slug, post)
  const displayPost = { ...post, title: seo.displayTitle, description: seo.description }
  return (
    <BlogLayout post={displayPost} slug={slug}>
      <p className="text-lg text-muted-foreground">
        Why runtime trust infrastructure is the missing layer between AI reasoning and real-world action.
      </p>

      <p>
        For a decade, we worried about what AI would <em>say</em>.
      </p>
      <p>
        Toxic outputs. Hallucinations. Bad answers in a chat window.
      </p>
      <p>
        That problem is being solved — guardrails, evals, red-teaming, content filters.
      </p>
      <p>But autonomous systems introduced a harder problem.</p>
      <p>
        <strong>What happens when AI stops talking and starts doing?</strong>
      </p>
      <p>
        A coding agent that opens a pull request is harmless until it merges to production.
      </p>
      <p>A workflow bot that reads email is fine until it forwards sensitive data.</p>
      <p>A robot that plans a path is safe until it moves.</p>
      <p>
        An MCP server that lists tools is innocent until one of them sends money, unlocks a door, or pushes a
        config change to prod.
      </p>
      <p>
        <strong>The risk shifted from bad outputs to unauthorized execution.</strong>
      </p>
      <p>
        And most teams still have no layer for that moment — the instant a planned action becomes a real side
        effect.
      </p>

      <h2>We built firewalls for networks. We never built one for actions.</h2>
      <p>Every serious infrastructure category eventually gets a runtime boundary:</p>
      <ul>
        <li>Networks got firewalls.</li>
        <li>APIs got gateways.</li>
        <li>Data got access control.</li>
        <li>Containers got policy engines.</li>
      </ul>
      <p>
        Autonomous AI — agents, embodied systems, workflow automation, MCP toolchains — is missing the
        equivalent.
      </p>
      <p>Not a log you read after something breaks.</p>
      <p>Not a guardrail that filters text.</p>
      <p>Not a dashboard that shows you what already went wrong.</p>
      <p>
        <strong>A decision layer that sits between reasoning and execution.</strong>
      </p>
      <p>Observe what the system intends to do.</p>
      <p>Verify it against policy, context, and risk.</p>
      <p>
        Gate it — approve, escalate, or block — <em>before</em> the side effect happens.
      </p>
      <p>That is <strong>runtime trust infrastructure</strong>.</p>

      <h2>This is not theoretical. It is already happening.</h2>
      <p>Agents are shipping to production without a verify-before-execute step.</p>
      <p>Tool calls go straight from the model to the API.</p>
      <p>Robotics stacks execute motion primitives with weak policy hooks.</p>
      <p>
        Enterprise teams are discovering runaway agent cost — and runaway agent <em>behavior</em> — in the same
        week.
      </p>
      <p>Prompt injection used to mean bad text.</p>
      <p>Now it means: <em>trick the agent into calling a tool it should never call.</em></p>
      <p>The industry spent years securing the model.</p>
      <p>
        <strong>Almost nobody secured the moment of execution.</strong>
      </p>
      <p>That gap is where the next decade of AI infrastructure will be built.</p>

      <h2>Introducing Sanctum Runtime</h2>
      <p>
        Today we are introducing <strong>Sanctum Runtime</strong> — runtime trust infrastructure for autonomous
        AI systems.
      </p>
      <p>Sanctum sits between AI reasoning and execution.</p>
      <p>Every action passes through a single gate:</p>
      <p>
        <strong>AI → Sanctum Runtime → Decision → Execution</strong>
      </p>
      <p>
        Decisions are explicit: <strong>approve</strong>, <strong>require verification</strong>, or{' '}
        <strong>block</strong>.
      </p>
      <p>
        Every decision is logged — correlation IDs, policy version, actor, context — so operators and compliance
        teams have evidence, not anecdotes.
      </p>
      <p>
        This is the layer we believe every serious autonomous system will need — the same way serious APIs
        eventually needed an API gateway, and serious deployments eventually needed observability.
      </p>
      <p>We are not selling fear.</p>
      <p>We are not selling &ldquo;robot protection.&rdquo;</p>
      <p>
        We are building <strong>trusted execution infrastructure</strong> — observable, permission-aware,
        auditable, and resilient — wherever AI can do, move, decide, control, access, trigger, or execute.
      </p>

      <h2>What makes Sanctum different</h2>
      <ol>
        <li>
          <strong>Proactive, not reactive</strong> — Shield and policy evaluation run <em>before</em>{' '}
          execution, not after the damage is done.
        </li>
        <li>
          <strong>Fleet-native</strong> — per-agent policies, threat signals, signed action tokens, and
          operator workflows — built for systems that run at scale, not single demos.
        </li>
        <li>
          <strong>Zero-install for agents</strong> — any agent connects over HTTP. Operators can approve or
          block from a phone. No heavyweight agent rewrite required.
        </li>
        <li>
          <strong>Open core, MIT</strong> — the SDK and core runtime are open. Self-host in Docker or on your
          own infra. No vendor lock-in for the trust boundary that should belong to you.
        </li>
        <li>
          <strong>One runtime, many worlds</strong> — the same gate works for software agents, MCP servers,
          workflow bots, robotics stacks, smart environments, and industrial automation. You define the actions.
          Sanctum enforces the policy.
        </li>
      </ol>

      <h2>A mental model for builders</h2>
      <p>If you are shipping anything autonomous, ask one question:</p>
      <blockquote>
        <p>
          <em>What happens between &ldquo;the model decided to act&rdquo; and &ldquo;the act actually
          happened&rdquo;?</em>
        </p>
      </blockquote>
      <p>If the answer is &ldquo;nothing&rdquo; — you do not have a trust layer yet.</p>
      <p>Sanctum is that layer.</p>
      <pre>
        <code>{`npm install @sanctum-runtime/sdk

const result = await sanctum.verifyAction({
  actor: 'billing-agent',
  action: 'transfer_funds',
  context: { amount: 4500, currency: 'USD' },
})
// APPROVE | REQUIRE_VERIFICATION | BLOCKED`}</code>
      </pre>
      <p>
        Five minutes to wire up. A lifetime of execution you can explain to security, legal, and your board.
      </p>

      <h2>Who this is for</h2>
      <ul>
        <li>
          <strong>Teams shipping AI agents</strong> that call real APIs, tools, and workflows
        </li>
        <li>
          <strong>Robotics and embodied AI builders</strong> who need policy before motion
        </li>
        <li>
          <strong>Platform engineers</strong> who need audit evidence for SOC2, NIST AI RMF, and internal
          governance
        </li>
        <li>
          <strong>Anyone who believes autonomous systems should be permission-aware by default</strong> — not
          locked down, but <em>trusted</em>
        </li>
      </ul>
      <p>We are early. The category is forming. We intend to help define it.</p>

      <h2>Start here</h2>
      <p>Sanctum Runtime is live.</p>
      <ul>
        <li>
          <Link to={docsPath} className="text-primary hover:underline">
            Documentation and quick start
          </Link>
        </li>
        <li>
          <a href={consoleUrl} className="text-primary hover:underline">
            Operator console
          </a>
        </li>
        <li>
          <a href={githubUrl} className="text-primary hover:underline">
            GitHub — sanctum-runtime
          </a>{' '}
          (MIT)
        </li>
        <li>
          <a
            href="https://www.npmjs.com/package/@sanctum-runtime/sdk"
            className="text-primary hover:underline"
          >
            npm — @sanctum-runtime/sdk
          </a>
        </li>
      </ul>
      <p>
        If you are building autonomous systems — agents, fleets, workflows, or physical AI — we would like to
        hear what your execution boundary looks like today.
      </p>
      <p>
        The future of AI is not just smarter models. <strong>It is systems we can trust when they act.</strong>
      </p>
      <p>
        Read next:{' '}
        <Link to={blogPostPath('runtime-trust-layer-for-ai-agents')} className="text-primary hover:underline">
          What is a runtime trust layer for AI agents?
        </Link>
        ,{' '}
        <Link to={blogPostPath('sanctum-vs-guardrails')} className="text-primary hover:underline">
          Sanctum vs guardrails
        </Link>
        , and{' '}
        <Link to={blogPostPath('mcp-server-action-gate')} className="text-primary hover:underline">
          MCP server action gate
        </Link>
        .
      </p>
    </BlogLayout>
  )
}
