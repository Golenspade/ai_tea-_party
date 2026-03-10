"use client";

import { useRef, useCallback } from "react";

/**
 * 打字机效果 Hook
 *
 * 设计思路：
 *   SSE 返回的 delta 可能是一大段文字（几十个字一个 chunk），
 *   直接 setState 会"蹦"出来。这个 hook 把所有到来的文字
 *   推入一个 FIFO 队列，然后用固定频率（默认每 30ms 一个字）
 *   从队列中取字符追加到消息里，视觉上形成逐字打出的效果。
 *
 * 使用方式：
 *   const { enqueue, flush, stop } = useTypewriter(updateFn);
 *   - enqueue(id, text)  当 SSE delta 到达时调用
 *   - flush(id)          流结束后把队列里剩余的一次性追加
 *   - stop(id)           出错时停止并清理
 */

type UpdateFn = (
  id: string,
  updater: (prev: string) => string,
) => void;

interface TypewriterState {
  queue: string[];
  timer: ReturnType<typeof setInterval> | null;
  flushing: boolean;
}

const DEFAULT_CHAR_INTERVAL_MS = 20; // 每个字符的间隔，越小越快
const CHARS_PER_TICK = 2;            // 每次 tick 输出的字符数

export function useTypewriter(
  onUpdate: UpdateFn,
  charIntervalMs = DEFAULT_CHAR_INTERVAL_MS,
  charsPerTick = CHARS_PER_TICK,
) {
  const statesRef = useRef<Map<string, TypewriterState>>(new Map());

  const getState = (id: string): TypewriterState => {
    let state = statesRef.current.get(id);
    if (!state) {
      state = { queue: [], timer: null, flushing: false };
      statesRef.current.set(id, state);
    }
    return state;
  };

  const startTimer = useCallback(
    (id: string) => {
      const state = getState(id);
      if (state.timer) return; // 已经在跑了

      state.timer = setInterval(() => {
        const s = statesRef.current.get(id);
        if (!s || s.queue.length === 0) {
          // 队列空了，停掉定时器
          if (s?.timer) {
            clearInterval(s.timer);
            s.timer = null;
          }
          return;
        }

        // 每次取 charsPerTick 个字符
        const batch = s.queue.splice(0, charsPerTick).join("");
        onUpdate(id, (prev) => prev + batch);
      }, charIntervalMs);
    },
    [onUpdate, charIntervalMs, charsPerTick],
  );

  /** 将一段文字推入队列，自动启动打字定时器 */
  const enqueue = useCallback(
    (id: string, text: string) => {
      const state = getState(id);
      // 按字符拆开，推入队列
      for (const ch of text) {
        state.queue.push(ch);
      }
      startTimer(id);
    },
    [startTimer],
  );

  /** 流结束后一次性 flush 剩余队列，并清理 */
  const flush = useCallback(
    (id: string) => {
      const state = statesRef.current.get(id);
      if (!state) return;

      // 停掉定时器
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }

      // 把剩余字符一次性追加
      if (state.queue.length > 0) {
        const remaining = state.queue.join("");
        state.queue = [];
        onUpdate(id, (prev) => prev + remaining);
      }

      statesRef.current.delete(id);
    },
    [onUpdate],
  );

  /** 出错或取消时停止 */
  const stop = useCallback((id: string) => {
    const state = statesRef.current.get(id);
    if (!state) return;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.queue = [];
    statesRef.current.delete(id);
  }, []);

  return { enqueue, flush, stop };
}
