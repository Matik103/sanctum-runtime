import type { ReactNode } from 'react'

type Props = { children: ReactNode }

/** Signed-in shell: auth palette with subdued grid + ambient orbs. */
export function MainCanvas({ children }: Props) {
  return (
    <main className="main">
      <div className="main__bg" aria-hidden>
        <div className="main__bg-grid" />
        <div className="main__bg-orb main__bg-orb--blue" />
        <div className="main__bg-orb main__bg-orb--purple" />
      </div>
      <div className="main__content">{children}</div>
    </main>
  )
}
