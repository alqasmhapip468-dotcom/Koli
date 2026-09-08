// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  })
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/groq.ts
var cachedModel = null;
var modelCachedAt = 0;
async function resolveGroqModel(apiKey) {
  if (cachedModel && Date.now() - modelCachedAt < 10 * 60 * 1e3) return cachedModel;
  const response = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0642\u0627\u0626\u0645\u0629 \u0646\u0645\u0627\u0630\u062C Groq");
  const payload = await response.json();
  const ids = (payload.data || []).filter((model) => model.active !== false).map((model) => model.id);
  const preferred = [
    "qwen/qwen3.6-27b",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "allam-2-7b",
    "groq/compound"
  ];
  const safeFallback = ids.find((id) => !/(guard|whisper|orpheus|safeguard|prompt)/i.test(id));
  cachedModel = preferred.find((id) => ids.includes(id)) || safeFallback || "qwen/qwen3.6-27b";
  modelCachedAt = Date.now();
  return cachedModel;
}
function removeHiddenThinking(content) {
  const withoutBlocks = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (withoutBlocks) return withoutBlocks;
  const finalMarker = content.match(/(?:final output|final answer|الإجابة النهائية|الجواب النهائي|réponse finale)\s*:\s*([\s\S]+)$/i);
  return finalMarker?.[1]?.trim() || content.trim();
}
function getSystemPrompt(language, mode, competitionContext) {
  const base = language === "ar" ? "\u0623\u0646\u062A \u0634\u064A\u0646\u0642\u0648\u060C \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0630\u0643\u064A \u062F\u0627\u062E\u0644 \u062A\u0637\u0628\u064A\u0642 \u06AA\u064F\u0648\u0644\u0650\u064A \u0644\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0627\u0644\u0645\u0648\u0631\u064A\u062A\u0627\u0646\u064A\u064A\u0646. \u0623\u062C\u0628 \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0641\u0635\u062D\u0649 \u0623\u0648 \u0627\u0644\u062D\u0633\u0627\u0646\u064A\u0629 \u0628\u062D\u0633\u0628 \u0644\u063A\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645. \u0643\u0646 \u0648\u0627\u0636\u062D\u064B\u0627\u060C \u0648\u062F\u0648\u062F\u064B\u0627\u060C \u0639\u0645\u0644\u064A\u064B\u0627\u060C \u0648\u0644\u0627 \u062A\u062F\u0651\u0639 \u0645\u0639\u0631\u0641\u0629 \u063A\u064A\u0631 \u0645\u0624\u0643\u062F\u0629. \u0627\u0633\u062A\u062E\u062F\u0645 \u062A\u0646\u0633\u064A\u0642 Markdown \u0639\u0646\u062F \u0627\u0644\u062D\u0627\u062C\u0629." : "Vous \xEAtes Shinqo, l\u2019assistant intelligent de l\u2019application \u06AA\u064F\u0648\u0644\u0650\u064A pour les utilisateurs mauritaniens. R\xE9pondez en fran\xE7ais, ou en arabe si l\u2019utilisateur \xE9crit en arabe. Soyez clair, chaleureux et pratique, sans inventer de faits. Utilisez Markdown lorsque cela aide.";
  if (mode !== "competitions") return base;
  const strict = language === "ar" ? "\u0623\u0646\u062A \u0627\u0644\u0622\u0646 \u062F\u0627\u062E\u0644 \u0642\u0633\u0645 \u0627\u0644\u0645\u0633\u0627\u0628\u0642\u0627\u062A \u0648\u0627\u0644\u0627\u0645\u062A\u062D\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0648\u0631\u064A\u062A\u0627\u0646\u064A\u0629. \u0623\u062C\u0628 \u0641\u0642\u0637 \u0627\u0639\u062A\u0645\u0627\u062F\u064B\u0627 \u0639\u0644\u0649 \u0627\u0644\u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0645\u0631\u0641\u0642\u0629 \u0623\u062F\u0646\u0627\u0647. \u0625\u0630\u0627 \u0644\u0645 \u062A\u0648\u062C\u062F \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0641\u064A\u0647\u0627\u060C \u0642\u0644 \u0628\u0648\u0636\u0648\u062D \u0625\u0646 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631\u0629 \u062D\u0627\u0644\u064A\u064B\u0627\u060C \u0648\u0644\u0627 \u062A\u062E\u0645\u0651\u0646 \u0648\u0644\u0627 \u062A\u062E\u062A\u0631\u0639 \u0645\u0648\u0639\u062F\u064B\u0627 \u0623\u0648 \u0634\u0631\u0637\u064B\u0627." : "Vous \xEAtes dans la rubrique des concours et examens mauritaniens. R\xE9pondez uniquement \xE0 partir des informations fournies ci-dessous. Si la r\xE9ponse n\u2019y figure pas, dites clairement qu\u2019elle n\u2019est pas disponible pour le moment. N\u2019inventez aucune date ni condition.";
  return `${base}

${strict}

Donn\xE9es de r\xE9f\xE9rence:
${competitionContext || "Aucune donn\xE9e de concours n\u2019est disponible."}`;
}
async function generateGroqReply(input) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  const model = await resolveGroqModel(apiKey);
  const messages = [
    { role: "system", content: getSystemPrompt(input.language, input.mode || "chat", input.competitionContext) },
    ...input.messages
  ];
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_completion_tokens: 512,
      reasoning_format: "hidden",
      ...model.startsWith("qwen/") ? { reasoning_effort: "none" } : {}
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Groq chat completion failed");
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response");
  return { content: removeHiddenThinking(content), model };
}

// server/file-extract.ts
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
async function extractTextFromFile(input) {
  const buffer = Buffer.from(input.base64, "base64");
  const extension = input.fileName.toLowerCase().split(".").pop();
  const mimeType = input.mimeType || "";
  if (mimeType === "application/pdf" || extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.trim();
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType.includes("word") || extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
  if (mimeType.startsWith("text/") || extension === "txt" || extension === "md" || extension === "csv") {
    return buffer.toString("utf8").trim();
  }
  throw new Error("\u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645 \u0644\u0644\u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u0646\u0635\u064A");
}

// server/firebase-data.ts
import { randomUUID } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = process.env.VITE_SUPABASE_URL || "https://xyukpakyarlwlagiltpa.supabase.co";
var supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
var adminEmail = (process.env.VITE_ADMIN_EMAIL || "alqasmhapip468@gmail.com").toLowerCase();
var supabase = createClient(supabaseUrl, supabaseServiceRoleKey || "placeholder-key", { auth: { autoRefreshToken: false, persistSession: false } });
function firebaseAuth() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("Firebase Admin credentials are not configured");
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getAuth();
}
async function authenticatedUser(req, res) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648\u0644\u064B\u0627" });
    return null;
  }
  try {
    return await firebaseAuth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: "\u0627\u0646\u062A\u0647\u062A \u062C\u0644\u0633\u0629 \u0627\u0644\u062F\u062E\u0648\u0644\u060C \u0633\u062C\u0651\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627" });
    return null;
  }
}
async function supabaseUserId(firebaseUser) {
  if (!firebaseUser.email) throw new Error("Firebase user email is required");
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1e3 });
  if (listed.error) throw listed.error;
  const normalized = firebaseUser.email.toLowerCase();
  const existing = listed.data.users.find((user) => user.email?.toLowerCase() === normalized || user.user_metadata?.firebase_uid === firebaseUser.uid);
  if (existing) return existing.id;
  const created = await supabase.auth.admin.createUser({
    email: firebaseUser.email,
    password: `${randomUUID()}Aa9!`,
    email_confirm: true,
    user_metadata: { firebase_uid: firebaseUser.uid }
  });
  if (created.error || !created.data.user) throw created.error || new Error("Unable to create Supabase identity");
  return created.data.user.id;
}
async function ownConversation(conversationId, userId) {
  const result = await supabase.from("conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
function fail(res, error) {
  console.error("[Firebase/Supabase] request failed", error);
  res.status(500).json({ error: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0627\u0644\u064A\u064B\u0627" });
}
function registerFirebaseDataRoutes(app) {
  app.get("/api/data/conversations", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      const id = await supabaseUserId(user);
      const result = await supabase.from("conversations").select("id,title,created_at,updated_at").eq("user_id", id).order("updated_at", { ascending: false });
      if (result.error) throw result.error;
      res.json(result.data || []);
    } catch (error) {
      fail(res, error);
    }
  });
  app.post("/api/data/conversations", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      const id = await supabaseUserId(user);
      const result = await supabase.from("conversations").insert({ user_id: id, title: String(req.body?.title || "\u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629") }).select("id,title,created_at,updated_at").single();
      if (result.error) throw result.error;
      res.json(result.data);
    } catch (error) {
      fail(res, error);
    }
  });
  app.patch("/api/data/conversations/:id", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      const id = await supabaseUserId(user);
      const result = await supabase.from("conversations").update({ title: String(req.body?.title || "\u0645\u062D\u0627\u062F\u062B\u0629 \u062C\u062F\u064A\u062F\u0629"), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", req.params.id).eq("user_id", id);
      if (result.error) throw result.error;
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });
  app.delete("/api/data/conversations/:id", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      const id = await supabaseUserId(user);
      const result = await supabase.from("conversations").delete().eq("id", req.params.id).eq("user_id", id);
      if (result.error) throw result.error;
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });
  app.get("/api/data/conversations/:id/messages", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      const id = await supabaseUserId(user);
      if (!await ownConversation(req.params.id, id)) {
        res.status(404).json({ error: "\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
        return;
      }
      const result = await supabase.from("messages").select("id,conversation_id,role,content,attachment_name,created_at").eq("conversation_id", req.params.id).order("created_at", { ascending: true });
      if (result.error) throw result.error;
      res.json(result.data || []);
    } catch (error) {
      fail(res, error);
    }
  });
  app.post("/api/data/conversations/:id/messages", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      const id = await supabaseUserId(user);
      if (!await ownConversation(req.params.id, id)) {
        res.status(404).json({ error: "\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
        return;
      }
      const result = await supabase.from("messages").insert({ conversation_id: req.params.id, role: req.body?.role, content: String(req.body?.content || ""), attachment_name: req.body?.attachmentName || null }).select("id,conversation_id,role,content,attachment_name,created_at").single();
      if (result.error) throw result.error;
      await supabase.from("conversations").update({ updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", req.params.id);
      res.json(result.data);
    } catch (error) {
      fail(res, error);
    }
  });
  app.get("/api/data/competitions", async (_req, res) => {
    try {
      const result = await supabase.from("competitions").select("id,title,conditions,dates,documents,steps,last_updated").order("last_updated", { ascending: false });
      if (result.error) throw result.error;
      res.json(result.data || []);
    } catch (error) {
      fail(res, error);
    }
  });
  app.post("/api/data/competitions", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      if (user.email?.toLowerCase() !== adminEmail) {
        res.status(403).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        return;
      }
      const result = await supabase.from("competitions").insert({ title: req.body.title, conditions: req.body.conditions, dates: req.body.dates, documents: req.body.documents, steps: req.body.steps, last_updated: (/* @__PURE__ */ new Date()).toISOString() });
      if (result.error) throw result.error;
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });
  app.patch("/api/data/competitions/:id", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      if (user.email?.toLowerCase() !== adminEmail) {
        res.status(403).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        return;
      }
      const result = await supabase.from("competitions").update({ title: req.body.title, conditions: req.body.conditions, dates: req.body.dates, documents: req.body.documents, steps: req.body.steps, last_updated: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", req.params.id);
      if (result.error) throw result.error;
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });
  app.delete("/api/data/competitions/:id", async (req, res) => {
    try {
      const user = await authenticatedUser(req, res);
      if (!user) return;
      if (user.email?.toLowerCase() !== adminEmail) {
        res.status(403).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
        return;
      }
      const result = await supabase.from("competitions").delete().eq("id", req.params.id);
      if (result.error) throw result.error;
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerFirebaseDataRoutes(app);
  app.post("/api/files/extract-text", async (req, res) => {
    try {
      const body = req.body;
      if (!body.fileName || !body.base64) {
        res.status(400).json({ error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629" });
        return;
      }
      const text2 = await extractTextFromFile({ fileName: body.fileName, mimeType: body.mimeType, base64: body.base64 });
      res.json({ text: text2.slice(0, 24e3) });
    } catch (error) {
      console.error("[Files] Text extraction failed", error);
      res.status(422).json({ error: "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u062E\u0631\u0627\u062C \u0627\u0644\u0646\u0635 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641" });
    }
  });
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const body = req.body;
      if (!body.messages?.length || !body.messages.every((message) => message.role === "user" || message.role === "assistant")) {
        res.status(400).json({ error: "\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" });
        return;
      }
      const result = await generateGroqReply({
        language: body.language === "fr" ? "fr" : "ar",
        mode: body.mode === "competitions" ? "competitions" : "chat",
        messages: body.messages.slice(-24),
        competitionContext: body.competitionContext
      });
      res.json(result);
    } catch (error) {
      console.error("[AI] Groq request failed", error);
      res.status(502).json({ error: "\u062A\u0639\u0630\u0631 \u0627\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u0631\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u062D\u0627\u0644\u064A\u064B\u0627" });
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
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
