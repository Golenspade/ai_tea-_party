"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character } from "@/lib/types";
import { type ResponseLength, fetchSettings, setResponseLength } from "@/services/api";
import type { VariableEntry } from "@/lib/types";

const LENGTH_OPTIONS: { value: ResponseLength; label: string; icon: string }[] = [
  { value: "short", label: "简短", icon: "📝" },
  { value: "default", label: "默认", icon: "💬" },
  { value: "long", label: "详细", icon: "📖" },
];

interface ChatBottombarProps {
  characters: Character[];
  roomVariables: VariableEntry[];
  globalVariables: VariableEntry[];
  onSendMessage: (characterId: string, content: string) => void;
}

type VariableCommandCheck = {
  valid: boolean;
  issue?: string;
};

function tokenizeCommandValue(raw: string): string[] {
  const re = /"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s]+)/g;
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    result.push((match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim());
  }
  return result;
}

function validateVariableCommand(
  input: string,
  roomVariables: VariableEntry[],
  globalVariables: VariableEntry[],
): VariableCommandCheck {
  const text = input.trim();
  if (!text.startsWith("/")) return { valid: true };

  const body = text.slice(1).trim();
  if (!body) return { valid: false, issue: "请输入具体变量命令，例如 /setvar mood happy" };

  const [opRaw, ...rest] = tokenizeCommandValue(body);
  const op = (opRaw || "").toLowerCase();
  const args = rest;
  const roomScopeNames = new Set(roomVariables.map((item) => item.name));
  const globalScopeNames = new Set(globalVariables.map((item) => item.name));

  const hasName = args.length >= 1 && args[0].trim() !== "";
  const hasNumberValue = (value: string): boolean => {
    if (!value.trim()) return false;
    return Number.isFinite(Number(value));
  };

  switch (op) {
    case "setvar":
    case "addvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /setvar mood happy" };
      }
      return { valid: true };

    case "incvar":
    case "decvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /incvar score 1" };
      }
      if (args.length >= 2 && !hasNumberValue(args.slice(1).join(" "))) {
        return {
          valid: false,
          issue: "增量必须是数字，支持 1 / -2 / 3.5；不填写默认为 1",
        };
      }
      if (!roomScopeNames.size) {
        return {
          valid: true,
          issue: "当前还没有任何 room 变量，命令将创建该变量（按加法语义初始化）",
        };
      }
      return { valid: true };

    case "getvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /getvar mood" };
      }
      if (!roomScopeNames.has(args[0]) && !globalScopeNames.has(args[0])) {
        return {
          valid: true,
          issue: `未找到变量 "${args[0]}"，将返回原值占位（如果存在）`,
        };
      }
        return { valid: true };

    case "flushvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /flushvar mood" };
      }
      return { valid: true };

    case "listvar":
      return { valid: true };

    case "setglobalvar":
    case "addglobalvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /setglobalvar tone neutral" };
      }
      return { valid: true };

    case "incglobalvar":
    case "decglobalvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /incglobalvar score 1" };
      }
      if (args.length >= 2 && !hasNumberValue(args.slice(1).join(" "))) {
        return {
          valid: false,
          issue: "增量必须是数字，支持 1 / -2 / 3.5；不填写默认为 1",
        };
      }
      if (!globalScopeNames.size) {
        return {
          valid: true,
          issue: "当前还没有任何全局变量，命令将创建该变量（按加法语义初始化）",
        };
      }
      return { valid: true };

    case "getglobalvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /getglobalvar mood" };
      }
      if (!globalScopeNames.has(args[0])) {
        return {
          valid: true,
          issue: `未找到全局变量 "${args[0]}"，将返回原值占位（如果存在）`,
        };
      }
      return { valid: true };

    case "listglobalvar":
      return { valid: true };

    case "flushglobalvar":
      if (!hasName) {
        return { valid: false, issue: "变量命令缺少变量名，例如: /flushglobalvar mood" };
      }
      return { valid: true };

    default:
      return {
        valid: false,
        issue: "暂不支持该变量命令：支持 /setvar /getvar /addvar /incvar /decvar /listvar /flushvar 与全局 variants",
      };
  }
}

export function ChatBottombar({
  characters,
  roomVariables,
  globalVariables,
  onSendMessage,
}: ChatBottombarProps) {
  const [selectedCharacter, setSelectedCharacter] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [responseLength, setLength] = useState<ResponseLength>("default");

  // 加载当前设置
  useEffect(() => {
    fetchSettings()
      .then((s) => setLength(s.response_length))
      .catch(() => {}); // 静默失败
  }, []);

  const variableCommandCheck = useMemo(
    () => validateVariableCommand(messageInput, roomVariables, globalVariables),
    [messageInput, roomVariables, globalVariables],
  );

  const handleSend = () => {
    if (!messageInput.trim()) return;

    const isCommand = messageInput.trim().startsWith("/");
    if (!variableCommandCheck.valid) return;

    if (!isCommand && !selectedCharacter) return;

    const targetCharacterId =
      isCommand && selectedCharacter ? selectedCharacter : characters[0]?.id;

    if (!targetCharacterId) return;

    onSendMessage(targetCharacterId, messageInput);
    setMessageInput("");
  };

  const isVariableCommand = messageInput.trim().startsWith("/");
  const isVariableMacro = messageInput.includes("{{") && messageInput.includes("::");
  const isCommandInvalid = isVariableCommand && !variableCommandCheck.valid;

  const handleLengthChange = async (length: ResponseLength) => {
    setLength(length);
    try {
      await setResponseLength(length);
    } catch (err) {
      console.error("Failed to update response length:", err);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 w-full p-4 sm:p-6 bg-gradient-to-t from-[#fdfaf5] via-[#fdfaf5]/90 to-transparent">
      <div className="max-w-3xl mx-auto flex flex-col gap-3 bg-white p-4 rounded-sm shadow-sm border border-[var(--theme-border)]">
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] pb-3 mb-1">
          <select 
            value={selectedCharacter}
            onChange={(e) => setSelectedCharacter(e.target.value)}
            className="bg-transparent text-sm font-book italic text-[var(--theme-accent)] outline-none cursor-pointer flex-1"
          >
            <option value="" disabled>Direct inquiry to...</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>

          {/* 回复长度选择器 */}
          <div className="flex items-center gap-0.5 ml-3 bg-[#f5f1ea] rounded-sm p-0.5">
            {LENGTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleLengthChange(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-sm transition-all ${
                  responseLength === opt.value
                    ? "bg-white shadow-sm text-[var(--theme-accent)] font-medium"
                    : "text-[var(--text)]/50 hover:text-[var(--text)]/80"
                }`}
                title={`回复长度: ${opt.label}`}
              >
                <span className="mr-1">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-end gap-2">
          <textarea
            placeholder="Type your inquiry here..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 resize-none bg-transparent outline-none text-sm font-sans leading-relaxed text-[var(--text)] placeholder:text-[var(--theme-accent)]/50 placeholder:italic min-h-[44px]"
            rows={2}
          />
          <button 
            onClick={handleSend}
            disabled={
              !messageInput.trim() ||
              isCommandInvalid ||
              (isVariableCommand
                ? characters.length === 0
                : !selectedCharacter)
            }
            className="text-xs uppercase tracking-[0.1em] font-bold text-[var(--theme-accent)] px-4 py-2 hover:bg-[#f1ede3] transition-colors disabled:opacity-50 disabled:hover:bg-transparent rounded-sm"
          >
            Submit
          </button>
        </div>
        {(isVariableCommand || isVariableMacro) && (
          <p
            className={`text-[11px] mt-2 ${isCommandInvalid ? "text-red-700" : "text-[#7e766c]"}`}
          >
            {isVariableCommand
              ? variableCommandCheck.valid
                ? variableCommandCheck.issue ??
                  "支持变量命令：/setvar、/getvar、/addvar、/incvar、/decvar、/listvar、/flushvar"
                : variableCommandCheck.issue
              : "支持变量命令：/setvar、/getvar、/addvar、/incvar、/decvar、/listvar、/flushvar"}
          </p>
        )}
      </div>
    </div>
  );
}
