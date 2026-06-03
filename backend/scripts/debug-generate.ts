import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { Agent } from "@earendil-works/pi-agent-core";
import { resolvePiModel } from "../src/services/resolve-pi-model.js";

import { appState } from "../src/store";

for (const envPath of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")]) {
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}
import { PromptAssembler } from "../src/services/prompt-assembler";
import { buildSupplementalSystemMessages, CharacterMemory, updateCharacterMemoryFromHistory } from "../src/services/character-memory";

async function main(): Promise<void> {
  const room = appState.getRoom("default");
  const character = room?.characters[0];
  if (!room || !character) {
    throw new Error("missing room or character");
  }

  const appProvider = process.env.APP_PROVIDER || "deepseek";
  const modelId = process.env.AI_MODEL || "deepseek-chat";
  const model = resolvePiModel(appProvider, modelId);
  if (!model) {
    throw new Error(`resolvePiModel failed: ${appProvider}/${modelId}`);
  }
  console.log("resolved", model.provider, model.id, model.api);

  const variableContext = {
    room: Object.fromEntries((await appState.listRoomVariables("default")).map((item) => [item.name, item.value])),
    global: Object.fromEntries((await appState.listGlobalVariables()).map((item) => [item.name, item.value])),
  };

  const memory = new CharacterMemory();
  updateCharacterMemoryFromHistory(memory, room.messages);
  const assembler = new PromptAssembler();
  const assembled = assembler.assemble({
    character,
    room,
    worldInfoBooks: [],
    responseLength: "default",
    variableContext,
    persona: appState.getDefaultPersona?.() ?? null,
  });

  const supplemental = buildSupplementalSystemMessages(memory, character, room.messages);
  const baseMessages = [...assembled.messages, ...supplemental];

  console.log("model", model.provider, model.id, model.api);
  console.log("baseMessages tail:", baseMessages.slice(-3));

  const agent = new Agent({
    initialState: {
      systemPrompt: assembled.systemPrompt,
      model,
      tools: [],
      messages: baseMessages.map((message) => ({
        role: message.role,
        content: [{ type: "text", text: message.content }],
        timestamp: Date.now(),
      })) as never,
    },
  });

  agent.subscribe((event) => {
    console.log("event:", JSON.stringify(event, null, 2).slice(0, 800));
  });

  await agent.prompt(`继续发言，以「${character.name}」身份进行对话。`);
  await agent.waitForIdle();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
