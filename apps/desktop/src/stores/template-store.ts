import { create } from "zustand";
import { backend, type TemplateLibrary } from "@/lib/backend";
import {
  privateTemplateItem,
  type TemplateCatalogItem,
} from "@/lib/template-catalog";
import {
  getAllTemplates,
  type TemplateCategory,
} from "@/lib/template-registry";
import { resetPrivatePreviewFailures } from "@/lib/template-preview-cache";

const builtins = (): TemplateCatalogItem[] =>
  getAllTemplates().map((t) => ({ ...t, source: "builtin" }));
function filtered(
  items: TemplateCatalogItem[],
  query: string,
  category: TemplateCategory | null,
  onlyPrivate: boolean,
) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(
    (t) =>
      (!onlyPrivate || t.source === "private") &&
      (!category || t.category === category) &&
      words.every((word) =>
        [
          t.name,
          t.description,
          t.documentClass,
          ...t.tags,
          t.category,
          t.subcategory,
        ]
          .join(" ")
          .toLowerCase()
          .includes(word),
      ),
  );
}
interface TemplateState {
  searchQuery: string;
  selectedCategory: TemplateCategory | null;
  onlyPrivate: boolean;
  selectedTemplateId: string | null;
  previewTemplateId: string | null;
  templates: TemplateCatalogItem[];
  filteredTemplates: TemplateCatalogItem[];
  libraryRoot: string;
  issues: TemplateLibrary["issues"];
  libraryError: string | null;
  loading: boolean;
  setSearchQuery(query: string): void;
  setSelectedCategory(category: TemplateCategory | null): void;
  setOnlyPrivate(value: boolean): void;
  selectTemplate(id: string | null): void;
  openPreview(id: string): void;
  closePreview(): void;
  refresh(): Promise<void>;
  reset(): void;
}
let loadGeneration = 0;
export const useTemplateStore = create<TemplateState>((set) => ({
  searchQuery: "",
  selectedCategory: null,
  onlyPrivate: false,
  selectedTemplateId: null,
  previewTemplateId: null,
  templates: builtins(),
  filteredTemplates: builtins(),
  libraryRoot: "",
  issues: [],
  libraryError: null,
  loading: false,
  setSearchQuery: (query) =>
    set((s) => ({
      searchQuery: query,
      filteredTemplates: filtered(
        s.templates,
        query,
        s.selectedCategory,
        s.onlyPrivate,
      ),
    })),
  setSelectedCategory: (category) =>
    set((s) => ({
      selectedCategory: category,
      onlyPrivate: false,
      filteredTemplates: filtered(s.templates, s.searchQuery, category, false),
    })),
  setOnlyPrivate: (value) =>
    set((s) => ({
      onlyPrivate: value,
      selectedCategory: null,
      filteredTemplates: filtered(s.templates, s.searchQuery, null, value),
    })),
  selectTemplate: (id) => set({ selectedTemplateId: id }),
  openPreview: (id) => set({ previewTemplateId: id }),
  closePreview: () => set({ previewTemplateId: null }),
  refresh: async () => {
    const generation = ++loadGeneration;
    resetPrivatePreviewFailures();
    set({ loading: true, libraryError: null });
    try {
      const library = await backend.templates.list();
      if (generation !== loadGeneration) return;
      const templates = [
        ...builtins(),
        ...library.templates.map(privateTemplateItem),
      ];
      set((s) => ({
        templates,
        libraryRoot: library.root,
        issues: library.issues,
        loading: false,
        filteredTemplates: filtered(
          templates,
          s.searchQuery,
          s.selectedCategory,
          s.onlyPrivate,
        ),
        previewTemplateId: templates.some((t) => t.id === s.previewTemplateId)
          ? s.previewTemplateId
          : null,
      }));
    } catch (error) {
      if (generation === loadGeneration)
        set({ loading: false, libraryError: String(error) });
    }
  },
  reset: () => {
    ++loadGeneration;
    set({
      searchQuery: "",
      selectedCategory: null,
      onlyPrivate: false,
      selectedTemplateId: null,
      previewTemplateId: null,
      templates: builtins(),
      filteredTemplates: builtins(),
      libraryRoot: "",
      issues: [],
      libraryError: null,
      loading: false,
    });
  },
}));
