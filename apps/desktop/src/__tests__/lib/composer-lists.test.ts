import { expect, it } from "vitest";
import { listContinuation } from "@/lib/composer-lists";

it.each([
  ["Instructions:\n- First", "Instructions:\n- First\n- "],
  ["  * Nested", "  * Nested\n  * "],
  ["+ First", "+ First\n+ "],
  ["9. Ninth", "9. Ninth\n10. "],
  ["  2) Second", "  2) Second\n  3) "],
  ["- First\n- ", "- First\n"],
  ["  2. \t", ""],
])("continues or exits %j", (input, expected) => {
  const edit = listContinuation(input, input.length)!;
  expect(input.slice(0, edit.from) + edit.text + input.slice(edit.to)).toBe(expected);
});
it("splits an item at the caret without losing the following text", () => {
  const input = "- First second\n- Third";
  const edit = listContinuation(input, 8)!;
  expect(input.slice(0, edit.from) + edit.text + input.slice(edit.to)).toBe("- First \n- second\n- Third");
});
it.each(["ordinary text", "-", "---", "x - item", "```tex\n- example", "~~~\n- example"])("leaves non-list text and fenced code alone: %j", (input) => {
  expect(listContinuation(input, input.length)).toBeNull();
});
it("resumes after a fenced block and leaves selections and list prefixes alone", () => {
  const input = "```\ncode\n```\n- item";
  expect(listContinuation(input, input.length)?.text).toBe("\n- ");
  expect(listContinuation("- item", 2, 6)).toBeNull();
  expect(listContinuation("- item", 1)).toBeNull();
});
