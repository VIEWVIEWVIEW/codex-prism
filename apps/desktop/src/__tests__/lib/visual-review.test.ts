import { describe, it, expect } from "vitest";
import { reviewBlocks } from "@/lib/review-diff";
import {
  renderedRegions,
  regionsOverlap,
  mergeVisualItems,
} from "@/lib/visual-regions";
import type { SourceBox } from "@/lib/visual-review";
describe("visual review source ranges", () => {
  it("keeps deletion empty after and points at surviving preceding context", () => {
    expect(reviewBlocks("first\ndeleted\nlast", "first\nlast")).toEqual([
      {
        before: { start: 2, end: 2 },
        after: null,
        context: { start: 1, end: 1 },
      },
    ]);
  });
  it("does not invent preceding context for deletion at document start", () => {
    expect(reviewBlocks("deleted\nlast", "last")[0].context).toBeNull();
  });
  it("preserves separate replacements and multiline ranges", () => {
    const blocks = reviewBlocks(
      "one\na\nb\nfour\nfive\nsix\nseven\nold",
      "one\nx\ny\nfour\nfive\nsix\nseven\nnew",
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[0].before).toEqual({ start: 2, end: 3 });
    expect(blocks[1].after).toEqual({ start: 8, end: 8 });
  });
});
describe("rendered region placement", () => {
  const box: SourceBox = {
    file: "main.tex",
    line: 3,
    page: 1,
    x: 10,
    y: 20,
    w: 100,
    h: 12,
  };
  it("preserves columns and pages and deduplicates identical boxes", () => {
    const regions = renderedRegions(
      [box, { ...box }, { ...box, x: 300 }, { ...box, page: 2 }],
      new Map(),
    );
    expect(regions).toHaveLength(3);
    expect(regionsOverlap([regions[0]], [regions[1]])).toBe(false);
  });
  it("retains equations without inventing text and rejects invalid geometry", () => {
    expect(renderedRegions([box, { ...box, w: NaN }], new Map())).toEqual([
      { page: 1, x: 10, y: 20, w: 100, h: 12, text: "" },
    ]);
  });
  it("empty SyncTeX candidates give no placement", () =>
    expect(renderedRegions([], new Map())).toEqual([]));
});

it("merges bridging blocks transitively and retains their source ranges", () => {
  const region = (x: number) => ({
    page: 1,
    x,
    y: 10,
    w: 10,
    h: 10,
    text: "rendered",
  });
  const item = (id: string, x: number) => ({
    id,
    reviewRevision: "test",
    beforeArtifact: "before",
    afterArtifact: "after",
    path: "main.tex",
    label: "Passage modified",
    before: [],
    after: [region(x)],
    ranges: [{ before: null, after: { start: 1, end: 1 }, context: null }],
    quality: "region" as const,
  });
  const merged = mergeVisualItems([item("a", 0), item("b", 15), item("c", 8)]);
  expect(merged).toHaveLength(1);
  expect(merged[0].ranges).toHaveLength(3);
});

it("uses surviving paragraph context across blank separator lines", () => {
  expect(
    reviewBlocks("survivor\n\ndeleted\nlast", "survivor\n\nlast")[0].context,
  ).toEqual({ start: 1, end: 1 });
});
