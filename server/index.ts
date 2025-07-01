import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./utils/utils"; // Updated import path
import { serveStatic } from "./static"; // New import
import dotenv from "dotenv";
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

console.log("Firebase Config from Env:", firebaseConfig);



// Only needed if you're using static frontend files
import path from "path";
import { fileURLToPath } from "url";

// ES module fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Background jobs
  const { startCleanupJob } = await import('./jobs/cleanup-scheduled-deletions');
  startCleanupJob();

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  // ✅ Serve static files (frontend)
  serveStatic(app);
  app.use(express.static(path.join(__dirname, "../dist/public")));

  // ✅ Handle frontend routing (like React SPA)
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../dist/public/index.html"));
  });

  // ✅ Health check
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // ✅ Root route (for Cloud Run test)
  app.get("/", (_req: Request, res: Response) => {
    res.send("✅ Indieshots API is running!");
  });

  const port = parseInt(process.env.PORT || '8080', 10);

  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);

    if (process.env.NODE_ENV === 'production' && process.env.K_SERVICE) {
      log(`Cloud Run service: ${process.env.K_SERVICE}`);
      log(`Cloud Run revision: ${process.env.K_REVISION}`);
    } else if (process.env.REPL_SLUG) {
      log(`External access: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.app`);
    }

    log(`Local access: http://localhost:${port}`);
    log(`Server bound to all interfaces (0.0.0.0:${port})`);
  });
})();
