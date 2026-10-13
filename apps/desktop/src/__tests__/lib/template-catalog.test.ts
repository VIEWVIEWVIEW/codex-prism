import { expect, it } from "vitest";
import {
  privateTemplateItem,
  templateInitialInstructions,
} from "@/lib/template-catalog";
import { getAllTemplates } from "@/lib/template-registry";

it("instructs Codex to adapt full private documents and retains built-in skeleton guidance", () => {
  const item = privateTemplateItem({
    id: "private:lab",
    revision: "version",
    name: "Lab",
    category: "academic",
    description: "",
    tags: [],
    mainFile: "paper.tex",
  });
  const privateGuidance = templateInitialInstructions(item);
  expect(privateGuidance.context).toContain("complete private template");
  expect(privateGuidance.context).not.toContain("empty document body");
  expect(privateGuidance.instructions).toContain("Preserve its structure");
  expect(
    templateInitialInstructions({ ...getAllTemplates()[0], source: "builtin" })
      .context,
  ).toContain("empty document body");
});
