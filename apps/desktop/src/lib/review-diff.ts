import { Text } from "@codemirror/state";
import { Chunk } from "@codemirror/merge";

export interface ReviewDiffLine {
  kind: "context" | "removed" | "added" | "gap";
  number?: number;
  text: string;
}

/** Unified line diff with two context lines around each changed block. */
export function reviewDiff(before: string, after: string): ReviewDiffLine[] {
  const a = Text.of(before.split("\n"));
  const b = Text.of(after.split("\n"));
  const chunks = Chunk.build(a, b, { timeout: 50 });
  const rows: ReviewDiffLine[] = [];
  let cursor = 1;
  const append = (
    doc: Text,
    from: number,
    to: number,
    kind: ReviewDiffLine["kind"],
  ) => {
    for (let line = from; line <= to; line++) {
      rows.push({ kind, number: line, text: doc.line(line).text });
    }
  };
  for (const [index, chunk] of chunks.entries()) {
    const first = b.lineAt(Math.min(chunk.fromB, b.length)).number;
    const contextStart = Math.max(cursor, first - 2);
    if (contextStart > cursor) rows.push({ kind: "gap", text: "…" });
    append(b, contextStart, first - 1, "context");
    if (chunk.fromA < chunk.toA) {
      append(
        a,
        a.lineAt(chunk.fromA).number,
        a.lineAt(chunk.endA).number,
        "removed",
      );
    }
    if (chunk.fromB < chunk.toB) {
      const last = b.lineAt(chunk.endB).number;
      append(b, first, last, "added");
      cursor = last + 1;
    } else {
      cursor = first;
    }
    const next = chunks[index + 1];
    const limit = next
      ? b.lineAt(Math.min(next.fromB, b.length)).number - 1
      : b.lines;
    const contextEnd = Math.min(limit, cursor + 1);
    append(b, cursor, contextEnd, "context");
    cursor = contextEnd + 1;
  }
  if (chunks.length && cursor <= b.lines) rows.push({ kind: "gap", text: "…" });
  return rows;
}

export interface SourceRange {
  start: number;
  end: number;
}
export interface ReviewBlock {
  before: SourceRange | null;
  after: SourceRange | null;
  context: SourceRange | null;
}
/** Inclusive line ranges; empty sides remain empty, never invented source lines. */
export function reviewBlocks(before: string, after: string): ReviewBlock[] {
  const a = Text.of(before.split("\n"));
  const b = Text.of(after.split("\n"));
  const precedingContext = (offset: number): SourceRange | null => {
    if (offset <= 0) return null;
    let line = b.lineAt(Math.min(offset - 1, b.length)).number;
    while (line > 1 && !b.line(line).text.trim()) line--;
    return b.line(line).text.trim() ? { start: line, end: line } : null;
  };
  return Chunk.build(a, b, { timeout: 100 }).map((c) => ({
    before:
      c.fromA < c.toA
        ? { start: a.lineAt(c.fromA).number, end: a.lineAt(c.endA).number }
        : null,
    after:
      c.fromB < c.toB
        ? { start: b.lineAt(c.fromB).number, end: b.lineAt(c.endB).number }
        : null,
    context: c.fromB === c.toB ? precedingContext(c.fromB) : null,
  }));
}
