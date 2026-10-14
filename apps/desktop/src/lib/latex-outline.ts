export interface TocItem {
  level: number;
  title: string;
  line: number;
  number: string | null;
}

// Source-based numbering for the open file; custom TeX counter macros and
// headings in other files are not evaluated here.
export function parseTableOfContents(content: string): TocItem[] {
  const levels = ["part", "chapter", "section", "subsection", "subsubsection"];
  const counters = [0, 0, 0, 0, 0];
  const lines = content.split("\n").map((line) => {
    // A percent sign is escaped only after an odd number of backslashes.
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== "%") continue;
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) backslashes++;
      if (backslashes % 2 === 0) return line.slice(0, i);
    }
    return line;
  });
  const hasChapters = lines.some((line) =>
    /\\chapter\*?\s*(?:\[[^\]]*\]\s*)?\{/.test(line),
  );
  const toc: TocItem[] = [];
  lines.forEach((line, index) => {
    const headings =
      /\\(part|chapter|section|subsection|subsubsection)(\*)?\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}/g;
    for (const match of line.matchAll(headings)) {
      const [, type, starred, title] = match;
      const level = levels.indexOf(type);
      let number: string | null = null;
      if (!starred) {
        counters[level]++;
        // Parts have their own counter and do not reset chapter/section counters.
        if (level > 0) counters.fill(0, level + 1);
        number =
          level === 0
            ? roman(counters[0])
            : counters.slice(hasChapters ? 1 : 2, level + 1).join(".");
      }
      toc.push({ level, title: title.trim(), line: index + 1, number });
    }
  });
  return toc;
}

function roman(value: number): string {
  let result = "";
  for (const [amount, symbol] of [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const) {
    while (value >= amount) {
      result += symbol;
      value -= amount;
    }
  }
  return result;
}
