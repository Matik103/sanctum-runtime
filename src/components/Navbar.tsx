import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { consoleUrl, docsPath, enterpriseAccessUrl, githubUrl } from "@/lib/site-links";
import logo from "@/assets/sanctum-logo.png";

const enterpriseIsInternal = !enterpriseAccessUrl.startsWith("http");

export function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 glass">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="Sanctum" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">Sanctum</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#problem" className="hover:text-foreground transition-colors">Problem</a>
          <a href="#solution" className="hover:text-foreground transition-colors">Runtime</a>
          <a href="#sdk" className="hover:text-foreground transition-colors">SDK</a>
          <a href="#use-cases" className="hover:text-foreground transition-colors">Use cases</a>
          <Link to="/blog" className="hover:text-foreground transition-colors">Blog</Link>
          <Link to="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground hover:text-foreground">
            <a href={githubUrl} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </Button>
          <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <a href={consoleUrl}>Start</a>
          </Button>
          {enterpriseIsInternal ? (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground">
              <Link to={enterpriseAccessUrl}>Enterprise</Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-muted-foreground">
              <a href={enterpriseAccessUrl}>Enterprise</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
