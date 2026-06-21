import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Character } from "@/lib/types";
import { CharacterList } from "./character-list";

const characters: Character[] = [
  {
    id: "char-1",
    name: "Alpha",
    personality: "calm",
    background: "",
    is_active: true,
  },
];

describe("CharacterList", () => {
  it("keeps speak and designate-next-speaker actions separate", () => {
    const onAISpeech = vi.fn();
    const onDesignateNextSpeaker = vi.fn();

    render(
      <CharacterList
        characters={characters}
        onAISpeech={onAISpeech}
        onDesignateNextSpeaker={onDesignateNextSpeaker}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle("Speak"));
    expect(onAISpeech).toHaveBeenCalledWith("char-1");
    expect(onDesignateNextSpeaker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("指定下轮"));
    expect(onDesignateNextSpeaker).toHaveBeenCalledWith("char-1");
  });
});
