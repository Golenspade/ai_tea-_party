export type ParagraphDiffOp =
  | { type: "equal"; text: string }
  | { type: "insert"; text: string }
  | { type: "delete"; text: string }
  | { type: "replace"; before: string; after: string };

/** Split message body into paragraphs on blank lines. */
export function splitParagraphs(content: string): string[] {
  if (!content) return [];
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Myers-style LCS backtrack over paragraph arrays, then collapse adjacent
 * delete+insert pairs into `replace` for clearer flash UI.
 */
export function diffParagraphs(before: string[], after: string[]): ParagraphDiffOp[] {
  const n = before.length;
  const m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (before[i] === after[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const raw: ParagraphDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      raw.push({ type: "equal", text: before[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: "delete", text: before[i] });
      i += 1;
    } else {
      raw.push({ type: "insert", text: after[j] });
      j += 1;
    }
  }
  while (i < n) {
    raw.push({ type: "delete", text: before[i] });
    i += 1;
  }
  while (j < m) {
    raw.push({ type: "insert", text: after[j] });
    j += 1;
  }

  return collapseReplace(raw);
}

export function computeParagraphDiff(previous: string, next: string): ParagraphDiffOp[] {
  return diffParagraphs(splitParagraphs(previous), splitParagraphs(next));
}

function collapseReplace(ops: ParagraphDiffOp[]): ParagraphDiffOp[] {
  const result: ParagraphDiffOp[] = [];
  for (let index = 0; index < ops.length; index += 1) {
    const current = ops[index];
    const next = ops[index + 1];
    if (current.type === "delete" && next?.type === "insert") {
      result.push({ type: "replace", before: current.text, after: next.text });
      index += 1;
      continue;
    }
    result.push(current);
  }
  return result;
}
