import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { docsPath, enterpriseAccessUrl, quickstartPath } from "@/lib/site-links";
import logo from "@/assets/sanctum-logo.png";

export function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 glass">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="Sanctum" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">Sanctum</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#problem" className="hover:text-foreground transition-colors">Problem</a>
          <a href="#solution" className="hover:text-foreground transition-colors">Runtime</a>
          <a href="#sdk" className="hover:text-foreground transition-colors">SDK</a>
          <a href="#use-cases" className="hover:text-foreground transition-colors">Use cases</a>
          <a href="#trust" className="hover:text-foreground transition-colors">Trust</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground">
            <Link to={docsPath}>Docs</Link>
          </Button>
          <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <Link to={quickstartPath}>Start</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground">
            <a href={enterpriseAccessUrl} target="_blank" rel="noopener noreferrer">
              Enterprise
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
