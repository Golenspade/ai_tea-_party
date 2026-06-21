"use client";

import { useEffect, useId, useMemo, useState } from "react";
import mermaid from "mermaid";

type RenderStatus = "rendering" | "ready" | "error";

interface MermaidDiagramProps {
  source: string;
}

let initialized = false;

function ensureMermaidInitialized(): void {
  if (initialized) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
  });
  initialized = true;
}

function normalizeRenderId(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return `mermaid-${normalized || "diagram"}`;
}

export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const reactId = useId();
  const renderId = useMemo(() => normalizeRenderId(reactId), [reactId]);
  const [status, setStatus] = useState<RenderStatus>("rendering");
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setStatus("rendering");

      try {
        ensureMermaidInitialized();
        const rendered = await mermaid.render(renderId, source);
        if (cancelled) {
          return;
        }

        setSvg(rendered.svg);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setSvg("");
          setStatus("error");
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [renderId, source]);

  if (status === "error") {
    return (
      <p role="alert" className="text-xs text-[#a35d40] italic my-2">
        图表渲染失败
      </p>
    );
  }

  if (status === "rendering") {
    return (
      <p className="text-xs text-[#7e766c] italic my-2">
        图表渲染中…
      </p>
    );
  }

  return (
    <div
      aria-label="Mermaid 图表"
      className="my-3 overflow-x-auto rounded-sm border border-[#e6dec1] bg-[#fbf8f1] px-3 py-2"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
