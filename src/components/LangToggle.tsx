import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm backdrop-blur hover:bg-accent"
    >
      <Languages className="h-4 w-4 text-primary" />
      {lang === "ar" ? "English" : "العربية"}
    </button>
  );
}
