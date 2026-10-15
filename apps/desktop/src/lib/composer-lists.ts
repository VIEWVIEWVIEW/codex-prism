/** A text-only edit; Markdown stays intact all the way to the agent. */
export function listContinuation(value: string, start: number, end = start) {
  // Let the textarea handle replacing selections normally.
  if (start !== end) return null;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", start);
  const line = value.slice(lineStart, lineEnd < 0 ? value.length : lineEnd);
  // Do not turn example code into lists, including indented fenced blocks.
  let fence: { char: string; length: number } | undefined;
  for (const previous of value.slice(0, lineStart).split("\n")) {
    const match = previous.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (!match) continue;
    if (!fence) fence = { char: match[1][0], length: match[1].length };
    else if (match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim())
      fence = undefined;
  }
  if (fence) return null;
  const match = line.match(/^([\t ]*)([-+*]|\d{1,9}[.)])([\t ]+)(.*)$/);
  if (!match || start < lineStart + match[1].length + match[2].length + match[3].length)
    return null;
  const [, indent, marker, , content] = match;
  if (!content.trim()) {
    // An empty item exits the list, retaining the surrounding text.
    return { from: lineStart, to: lineStart + line.length, text: "" };
  }
  const nextMarker = /^\d/.test(marker)
    ? `${Number(marker.slice(0, -1)) + 1}${marker.slice(-1)}`
    : marker;
  return { from: start, to: end, text: `\n${indent}${nextMarker} ` };
}
