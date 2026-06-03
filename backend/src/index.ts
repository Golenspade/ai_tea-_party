import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config } from "dotenv";

import { appState } from "./store";
import { RoomSocketManager } from "./room-hub";
import { registerRestRoutes } from "./routes/rest";
import { registerSseRoutes } from "./routes/sse";
import { registerWsRoutes } from "./routes/ws";

config();

const app = Fastify({ logger: true });
const socketManager = new RoomSocketManager();

app.register(cors, {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
  ],
  credentials: true,
});

app.register(websocket);

registerRestRoutes(app, { socketManager });
registerSseRoutes(app, socketManager);
registerWsRoutes(app, { socketManager });

app.get("/", async () => ({
  message: "AI Tea Party TS API",
  version: "2.2.0-ts",
  docs: "/docs",
}));

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3004);

app
  .listen({ host, port })
  .then((address) => {
    app.log.info(`🚀 TS backend running at ${address}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
