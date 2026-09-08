import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { setupVite, serveStatic } from "./vite";
import { generateGroqReply } from "../groq";
import { extractTextFromFile } from "../file-extract";
import { registerFirebaseDataRoutes } from "../firebase-data";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerFirebaseDataRoutes(app);
  app.post("/api/files/extract-text", async (req, res) => {
    try {
      const body = req.body as { fileName?: string; mimeType?: string; base64?: string };
      if (!body.fileName || !body.base64) {
        res.status(400).json({ error: "بيانات الملف غير مكتملة" });
        return;
      }
      const text = await extractTextFromFile({ fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 });
      res.json({ text: text.slice(0, 24000) });
    } catch (error) {
      console.error("[Files] Text extraction failed", error);
      res.status(422).json({ error: "تعذر استخراج النص من هذا الملف" });
    }
  });
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const body = req.body as {
        language?: "ar" | "fr";
        mode?: "chat" | "competitions";
        messages?: Array<{ role: "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }> }>;
        competitionContext?: string;
      };
      if (!body.messages?.length || !body.messages.every((message) => message.role === "user" || message.role === "assistant")) {
        res.status(400).json({ error: "رسائل المحادثة غير صالحة" });
        return;
      }
      const result = await generateGroqReply({
        language: body.language === "fr" ? "fr" : "ar",
        mode: body.mode === "competitions" ? "competitions" : "chat",
        messages: body.messages.slice(-24),
        competitionContext: body.competitionContext,
      });
      res.json(result);
    } catch (error) {
      console.error("[AI] Groq request failed", error);
      res.status(502).json({ error: "تعذر الحصول على رد الذكاء الاصطناعي حاليًا" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
