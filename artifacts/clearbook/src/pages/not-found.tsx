import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-foreground p-6">
      <div className="flex flex-col items-center text-center max-w-md">
        <AlertCircle className="h-16 w-16 text-muted-foreground mb-6" />
        <h1 className="text-4xl font-serif mb-4">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The requested ledger or interface does not exist in this environment. 
          Please check the URL or return home.
        </p>
        <Link href="/" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2">
          <ArrowLeft className="h-4 w-4" /> Return to Entry
        </Link>
      </div>
    </div>
  );
}
