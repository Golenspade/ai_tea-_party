"use client";

import type { Character, Message } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseMarkdownBlocks } from "@/lib/markdown-blocks";
import { MermaidDiagram } from "@/components/chat/mermaid-diagram";
import type { ParagraphDiffOp } from "@/services/paragraph-diff";

interface ChatBubbleProps {
  message: Message;
  characters: Character[];
  isPatched?: boolean;
  paragraphDiff?: ParagraphDiffOp[];
}

export function MarkdownBody({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          if (!block.content.trim()) return null;
          return (
            <ReactMarkdown key={`text-${index}`} remarkPlugins={[remarkGfm]}>
              {block.content}
            </ReactMarkdown>
          );
        }

        if (block.language === "mermaid" && !block.complete) {
          return (
            <p key={`mermaid-pending-${index}`} className="text-xs text-[#7e766c] italic my-2">
              图表渲染中…
            </p>
          );
        }

        if (block.language === "mermaid") {
          return (
            <MermaidDiagram
              key={`mermaid-${index}`}
              source={block.content}
            />
          );
        }

        return (
          <pre
            key={`code-${index}`}
            className="my-2 overflow-x-auto rounded-sm bg-[#f5f1e8] px-3 py-2 text-xs"
          >
            <code>{block.content}</code>
          </pre>
        );
      })}
    </>
  );
}

function PatchParagraph({
  op,
  text,
  variant,
}: {
  op: ParagraphDiffOp["type"];
  text: string;
  variant: "equal" | "insert" | "delete";
}) {
  const className =
    variant === "insert"
      ? "patch-para patch-para-insert"
      : variant === "delete"
        ? "patch-para patch-para-delete"
        : "patch-para";

  return (
    <div data-patch-op={op} data-patch-variant={variant} className={className}>
      <MarkdownBody content={text} />
    </div>
  );
}

export function ParagraphDiffBody({ ops }: { ops: ParagraphDiffOp[] }) {
  return (
    <div className="space-y-3" data-paragraph-diff="true">
      {ops.map((op, index) => {
        if (op.type === "equal") {
          return <PatchParagraph key={`eq-${index}`} op="equal" text={op.text} variant="equal" />;
        }
        if (op.type === "insert") {
          return <PatchParagraph key={`ins-${index}`} op="insert" text={op.text} variant="insert" />;
        }
        if (op.type === "delete") {
          return <PatchParagraph key={`del-${index}`} op="delete" text={op.text} variant="delete" />;
        }
        return (
          <div key={`rep-${index}`} className="space-y-2" data-patch-op="replace">
            <PatchParagraph op="replace" text={op.before} variant="delete" />
            <PatchParagraph op="replace" text={op.after} variant="insert" />
          </div>
        );
      })}
    </div>
  );
}

export function CustomChatBubble({ message, isPatched, paragraphDiff }: ChatBubbleProps) {
  const showParagraphDiff = Boolean(isPatched && paragraphDiff && paragraphDiff.length > 0);
  const patchClass = isPatched && !showParagraphDiff
    ? "bg-[#fff7d6] ring-1 ring-[#d6a846]/50 shadow-[0_0_0_3px_rgba(214,168,70,0.12)]"
    : "";

  if (message.is_system) {
    return (
      <div
        data-patched={isPatched ? "true" : undefined}
        className={`flex justify-center py-4 rounded-sm transition-all duration-500 ${patchClass}`}
      >
        <span className="text-xs font-sans tracking-wide text-[#a35d40] px-4 py-1 border border-[#e6dec1] rounded-full bg-[#fbf8f1]">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.sender_type === "user";
  const senderMeta = isUser
    ? message.sender_user_id
      ? `#${message.sender_user_id.slice(0, 8)}`
      : "#guest"
    : undefined;
  const messageAuthor = isUser
    ? message.sender_user_name || message.character_name
    : message.character_name;

  if (isUser) {
    return (
      <div className="pl-6 border-l border-[#e6dec1] ml-4 bg-[#fbf8f1] p-4 rounded-r-md shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs uppercase tracking-[0.1em] font-bold text-[#3b3631]">
            {messageAuthor} /
          </span>
          {senderMeta && (
            <span className="text-xs text-[#999]">{senderMeta}</span>
          )}
          <span className="text-xs text-[#7e766c]">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="text-sm font-sans leading-relaxed text-[#3b3631] whitespace-pre-wrap prose prose-sm max-w-none">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div
      data-patched={isPatched ? "true" : undefined}
      className={`group pt-2 rounded-sm transition-all duration-500 ${patchClass}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <span className="font-book italic tracking-wide text-lg text-[#a35d40]">{message.character_name}</span>
        <div className="h-px bg-[#e6dec1] flex-1"></div>
        <span className="text-xs text-[#7e766c] uppercase tracking-wider font-sans">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      
      <div className="font-book text-[1.05rem] leading-8 text-[#3b3631] text-justify">
        <div className="prose prose-sm md:prose-base lg:prose-lg max-w-none text-inherit leading-8 drop-cap marker:text-[#a35d40] prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:font-book prose-headings:text-[#3b3631]">
          {showParagraphDiff && paragraphDiff ? (
            <ParagraphDiffBody ops={paragraphDiff} />
          ) : (
            <MarkdownBody content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}
