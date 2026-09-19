import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-6 font-sans">
      <div className="border border-border bg-card p-12 max-w-lg w-full shadow-sm flex flex-col items-center gap-4 animate-in fade-in duration-700">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <h1 className="font-serif text-3xl text-foreground">Page not found</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-4">
          The requested ledger or interface does not exist in this environment. 
          Please check the URL or return home.
        </p>
        <Link href="/" className="text-[11px] font-sans uppercase tracking-[0.08em] text-foreground border-b border-foreground pb-0.5 hover:text-primary hover:border-primary transition-colors">
          Return to search
        </Link>
      </div>
    </div>
  );
}
