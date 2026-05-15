import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import logo from "@/assets/sanctum-logo.png";

export function CtaFooter() {
  return (
    <section className="relative py-24 md:py-36 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-glow" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[800px] bg-gradient-primary opacity-20 blur-[120px] rounded-full" />

      <div className="container relative mx-auto px-6 text-center">
        <h2 className="font-display text-5xl md:text-6xl font-semibold leading-tight">
          Build AI humans <br className="hidden md:block" />
          can <span className="text-gradient">trust</span>.
        </h2>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          Join early access for runtime trust infrastructure — agents today, embodied systems tomorrow.
        </p>
        <div className="mt-10 flex justify-center">
          <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 h-12 px-8">
            Request Access
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <footer className="container relative mx-auto mt-24 px-6 border-t border-border pt-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Sanctum" className="h-6 w-6" />
            <span className="font-display font-semibold text-foreground">Sanctum</span>
            <span className="ml-2">— Runtime trust for autonomous AI</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-foreground">Docs</a>
            <a href="#" className="hover:text-foreground">GitHub</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
