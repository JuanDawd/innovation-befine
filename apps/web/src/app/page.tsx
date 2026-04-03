import type { AppRole } from "@befine/types";
import { Button } from "@/components/ui/button";

const roles: AppRole[] = ["admin", "secretary", "stylist", "clothier"];

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Innovation Befine</h1>
      <p className="text-muted-foreground">Internal operations platform</p>
      <div className="flex gap-2">
        {roles.map((role) => (
          <Button key={role} variant="outline">
            {role}
          </Button>
        ))}
      </div>
    </main>
  );
}
