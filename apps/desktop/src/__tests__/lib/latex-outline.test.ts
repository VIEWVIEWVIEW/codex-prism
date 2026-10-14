import { describe, expect, it } from "vitest";
import { parseTableOfContents } from "@/lib/latex-outline";

describe("outline numbering", () => {
  it("numbers nested headings and resets subordinate counters", () => {
    const toc = parseTableOfContents(String.raw`\section{Introduction}
\subsection{Context}
\subsubsection{Details}
\subsection{Goals}
\section{Methods}
\subsection{Setup}`);
    expect(toc.map((item) => item.number)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.2",
      "2",
      "2.1",
    ]);
    expect(toc[5]).toMatchObject({ title: "Setup", line: 6 });
  });

  it("does not count starred or commented headings", () => {
    const toc = parseTableOfContents(String.raw`% \section{Ignored}
\section*[Short]{Preface}
\section[Short]{First} % \section{Ignored}
\section*{Acknowledgements}
\section{Second}`);
    expect(toc.map((item) => item.number)).toEqual([null, "1", null, "2"]);
    expect(toc.map((item) => item.title)).toEqual([
      "Preface",
      "First",
      "Acknowledgements",
      "Second",
    ]);
  });

  it("includes chapter counters while keeping parts independent", () => {
    const toc = parseTableOfContents(String.raw`\part{First}
\chapter{One}
\section{Section}
\subsection{Subsection}
\part{Second}
\chapter{Two}
\section{Section}`);
    expect(toc.map((item) => item.number)).toEqual([
      "I",
      "1",
      "1.1",
      "1.1.1",
      "II",
      "2",
      "2.1",
    ]);
  });
});
