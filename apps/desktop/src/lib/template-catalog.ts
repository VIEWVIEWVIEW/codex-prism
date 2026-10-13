import type { TemplateDefinition } from "./template-registry";
import type { PrivateTemplateSummary } from "./backend";

export type TemplateCatalogItem =
  | (TemplateDefinition & { source: "builtin" })
  | (Omit<TemplateDefinition, "content" | "hasBibliography"> & {
      source: "private";
      revision: string;
    });

export function privateTemplateItem(
  template: PrivateTemplateSummary,
): TemplateCatalogItem {
  return {
    ...template,
    source: "private",
    mainFileName: template.mainFile,
    subcategory: "blank",
    icon: "FileText",
    documentClass: "Local template",
    packages: [],
    accentColor: "#64748b",
    aspectRatio: "3/4",
  };
}

export function templateInitialInstructions(template: TemplateCatalogItem): {
  context: string;
  instructions: string;
} {
  return template.source === "private"
    ? {
        context:
          "> The project contains the complete private template, including its document body and supporting files.",
        instructions:
          "Please adapt the existing document based on my description. Preserve its structure, preamble, styling, custom commands, and supporting files. Keep useful starter content and placeholders unless my description asks to change them.",
      }
    : {
        context:
          "> The file currently contains only the LaTeX preamble (packages, styling, custom commands) with an empty document body.",
        instructions: `Please generate the full document content based on my description. Keep the existing preamble and fill in the document body (between \\begin{document} and \\end{document}) with appropriate title, author, sections, and content. Make it a complete, well-structured **${template.name.toLowerCase()}** ready for me to refine.`,
      };
}
