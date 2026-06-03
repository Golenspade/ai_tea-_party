export type MarkdownBlock =
  | { type: "text"; content: string }
  | { type: "code"; language: string; content: string; complete: boolean };

const FENCE_OPEN_RE = /^```(\w*)\s*$/;
const FENCE_CLOSE_RE = /^```\s*$/;

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.split("\n");
  let textBuffer: string[] = [];
  let inFence = false;
  let fenceLang = "";
  let fenceLines: string[] = [];

  const flushText = () => {
    if (textBuffer.length) {
      blocks.push({ type: "text", content: textBuffer.join("\n") });
      textBuffer = [];
    }
  };

  for (const line of lines) {
    const openMatch = line.match(FENCE_OPEN_RE);

    if (!inFence && openMatch) {
      flushText();
      inFence = true;
      fenceLang = (openMatch[1] || "").trim();
      fenceLines = [];
      continue;
    }

    if (inFence) {
      if (FENCE_CLOSE_RE.test(line)) {
        blocks.push({
          type: "code",
          language: fenceLang,
          content: fenceLines.join("\n"),
          complete: true,
        });
        inFence = false;
        fenceLang = "";
        fenceLines = [];
      } else {
        fenceLines.push(line);
      }
      continue;
    }

    textBuffer.push(line);
  }

  flushText();

  if (inFence) {
    blocks.push({
      type: "code",
      language: fenceLang,
      content: fenceLines.join("\n"),
      complete: false,
    });
  }

  return blocks;
}
