import {
  GraduationCapIcon,
  BriefcaseIcon,
  PaletteIcon,
  SparklesIcon,
} from "lucide-react";
import {
  type TemplateCategory,
  CATEGORY_LABELS,
  getCategories,
} from "@/lib/template-registry";
import { useTemplateStore } from "@/stores/template-store";

const CATEGORY_ICONS: Record<TemplateCategory, React.ReactNode> = {
  academic: <GraduationCapIcon className="size-4" />,
  professional: <BriefcaseIcon className="size-4" />,
  creative: <PaletteIcon className="size-4" />,
  starter: <SparklesIcon className="size-4" />,
};

export function CategorySidebar() {
  const selectedCategory = useTemplateStore((s) => s.selectedCategory);
  const setSelectedCategory = useTemplateStore((s) => s.setSelectedCategory);
  const templates = useTemplateStore((s) => s.templates);
  const onlyPrivate = useTemplateStore((s) => s.onlyPrivate);
  const setOnlyPrivate = useTemplateStore((s) => s.setOnlyPrivate);
  const allCount = templates.length;

  return (
    <nav className="flex w-48 shrink-0 flex-col gap-1 overflow-y-auto py-2 pr-3">
      {/* All templates */}
      <button
        onClick={() => setSelectedCategory(null)}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          selectedCategory === null && !onlyPrivate
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        }`}
      >
        <SparklesIcon className="size-4" />
        <span className="flex-1">All Templates</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {allCount}
        </span>
      </button>

      <button
        onClick={() => setOnlyPrivate(!onlyPrivate)}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${onlyPrivate ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
      >
        <BriefcaseIcon className="size-4" />
        <span className="flex-1">My Templates</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {templates.filter((t) => t.source === "private").length}
        </span>
      </button>

      <div className="my-1.5 h-px bg-border" />

      {/* Categories */}
      {getCategories().map((cat) => {
        const count = templates.filter((t) => t.category === cat).length;
        const isActive = selectedCategory === cat;
        return (
          <button
            key={cat}
            onClick={() => setSelectedCategory(isActive ? null : cat)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              isActive
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {CATEGORY_ICONS[cat]}
            <span className="flex-1">{CATEGORY_LABELS[cat]}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
