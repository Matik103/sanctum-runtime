import {
  Workflow,
  Bot,
  Factory,
  Plane,
  Home,
  Rocket,
  Cpu,
  Shield,
  HeartPulse,
  Car,
  MessageCircle,
  Settings2,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

const cases = [
  { icon: Workflow, title: 'AI Agents', desc: 'Verify emails, files, APIs, and workflows before they execute.' },
  { icon: Bot, title: 'Humanoids', desc: 'Authorize physical actions — unlock, grasp, navigate — against signed policy.' },
  { icon: Cpu, title: 'Embodied AI', desc: 'Grasp, release, and motion commands with zone and proximity context.' },
  { icon: Home, title: 'Smart Home', desc: 'Locks, alarms, and automations with local intent verification.' },
  { icon: Settings2, title: 'AI Operating Systems', desc: 'Gate install, delete, and privileged process actions.' },
  { icon: Factory, title: 'Robotics Integrators', desc: 'ROS2, warehouse AMR, dock, and calibrate with fleet policy.' },
  { icon: Rocket, title: 'Workflow Automation', desc: 'n8n, CrewAI, CRM updates — governance for AI workflows.' },
  { icon: Shield, title: 'Physical Security / Edge', desc: 'Gates, perimeter, and camera streams at the edge.' },
  { icon: HeartPulse, title: 'Healthcare Robotics', desc: 'Dispense, bed motion, and record access with role policy.' },
  { icon: Car, title: 'Autonomous Mobility', desc: 'Route changes, mode engage, and door control with geofencing.' },
  { icon: MessageCircle, title: 'AI Companions', desc: 'Messages, memory, and orders with consent-aware policy.' },
  { icon: Plane, title: 'Industrial Automation', desc: 'Emergency stop, line start, and setpoint adjustments.' },
]

export function UseCases() {
  return (
    <section id="use-cases" className="relative py-24 md:py-32">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Use cases</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">High-risk teams that need runtime control now</h2>
          <p className="mt-4 text-muted-foreground">
            Teams shipping agents that can write, buy, deploy, message, move, unlock,
            or touch customer data need runtime control now — not after an incident.
          </p>
        </div>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cases.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group glass rounded-xl p-6 hover:border-primary/50 hover:bg-surface/80 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-gradient-primary group-hover:text-primary-foreground transition-all">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          <Link to="/glossary/" className="text-primary hover:underline">
            Glossary
          </Link>
          {' · '}
          <Link to="/blog/embodied-ai-robotics-policy-gate/" className="text-primary hover:underline">
            Embodied AI guide
          </Link>
          {' · '}
          <a
            href="https://github.com/Matik103/sanctum-runtime/blob/main/CATEGORIES.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Full category matrix
          </a>
        </p>
      </div>
    </section>
  )
}
