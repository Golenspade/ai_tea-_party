import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VariableHudPanel } from "./variable-hud-panel";
import type { ResolvedVariableDisplay } from "@/lib/variable-viz";

describe("VariableHudPanel", () => {
  it("renders nothing when there are no displays", () => {
    const { container } = render(<VariableHudPanel displays={[]} values={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders gauges for resolved room displays", () => {
    const displays: ResolvedVariableDisplay[] = [
      {
        name: "danger",
        label: "危险",
        min: 0,
        max: 100,
        polarity: "higher_is_worse",
        show_in_hud: true,
        source: "inferred",
      },
    ];

    render(<VariableHudPanel displays={displays} values={{ danger: 12 }} />);

    expect(screen.getByTestId("variable-hud-panel")).toBeInTheDocument();
    expect(screen.getByTestId("variable-hud-danger")).toHaveTextContent("危险");
    expect(screen.getByTestId("variable-hud-danger")).toHaveTextContent("12");
  });

  it("marks overflow values with an exclamation", () => {
    const displays: ResolvedVariableDisplay[] = [
      {
        name: "danger",
        label: "危险",
        min: 0,
        max: 100,
        polarity: "higher_is_worse",
        show_in_hud: true,
        source: "explicit",
      },
    ];

    render(<VariableHudPanel displays={displays} values={{ danger: 120 }} />);
    expect(screen.getByTitle("超出量程")).toHaveTextContent("!");
  });
});
