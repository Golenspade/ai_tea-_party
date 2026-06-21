import { render, screen, waitFor } from "@testing-library/react";
import mermaid from "mermaid";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MermaidDiagram } from "./mermaid-diagram";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

const mockedMermaid = vi.mocked(mermaid);

describe("MermaidDiagram", () => {
  beforeEach(() => {
    mockedMermaid.render.mockReset();
  });

  it("renders mermaid svg into the diagram container", async () => {
    mockedMermaid.render.mockResolvedValueOnce({
      svg: "<svg><text>Rendered</text></svg>",
      bindFunctions: vi.fn(),
    });

    render(<MermaidDiagram source={"graph TD\nA-->B"} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Mermaid 图表").querySelector("svg")).toBeTruthy();
    });
    expect(screen.getByText("Rendered")).toBeInTheDocument();
    expect(mockedMermaid.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: "strict",
    });
    expect(mockedMermaid.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-/),
      "graph TD\nA-->B",
    );
  });

  it("shows only an error state when rendering fails", async () => {
    mockedMermaid.render.mockRejectedValueOnce(new Error("bad syntax"));

    render(<MermaidDiagram source={"graph TD\n>"} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("图表渲染失败");
    expect(screen.queryByText("graph TD")).not.toBeInTheDocument();
  });
});
