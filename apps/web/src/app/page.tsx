import type { AppRole } from "@befine/types";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const roles: AppRole[] = ["admin", "secretary", "stylist", "clothier"];

export default function HomePage() {
  const t = useTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">{t("home.title")}</h1>
      <p className="text-muted-foreground">{t("home.subtitle")}</p>
      <div className="flex gap-2">
        {roles.map((role) => (
          <Button key={role} variant="outline">
            {t(`roles.${role}`)}
          </Button>
        ))}
      </div>
    </main>
  );
}
