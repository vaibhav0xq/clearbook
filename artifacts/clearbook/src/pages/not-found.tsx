import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Reveal } from "@/components/motion/reveal";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 grain" />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] grid-lines opacity-40" />
      
      <div className="absolute top-5 left-5 md:top-8 md:left-10">
        <Brand />
      </div>
      
      <Reveal className="flex flex-col items-center gap-5">
        <h1 className="display text-[100px] md:text-[140px] text-foreground/10 leading-none">404</h1>
        <h2 className="display text-[32px] md:text-[40px] text-foreground">Page not found</h2>
        <p className="text-[15px] text-muted-foreground max-w-[400px] leading-relaxed">
          This address does not match a page in Clearbook. Check the URL or go back to the lookup.
        </p>
        <Link 
          href="/" 
          className="group mt-4 inline-flex items-center gap-2 rounded-full border hairline bg-white/[0.03] px-5 py-2.5 text-[12px] uppercase tracking-[0.12em] text-foreground transition-all hover:bg-white/[0.08]"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground transition-transform duration-500 ease-out-expo group-hover:-translate-x-0.5" />
          Back to lookup
        </Link>
      </Reveal>
    </div>
  );
}
