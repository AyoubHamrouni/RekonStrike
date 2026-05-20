import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { PlaywrightService } from "./playwright-service";
import type { CaptureRequest } from "./schemas";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

const browserService = new PlaywrightService();

app.post("/capture", async (req, res) => {
  const expectedToken = process.env.BROWSER_SERVICE_TOKEN;
  if (expectedToken) {
    const auth = req.header("authorization") || "";
    if (auth !== `Bearer ${expectedToken}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }
  const body = (req.body || {}) as CaptureRequest;
  const { target_url } = body;
  if (!target_url) {
    return res.status(400).json({ error: "target_url required" });
  }

  const result = await browserService.captureSafe(body);
  return res.json(result);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`browser-service listening on ${port}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await browserService.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await browserService.close();
  process.exit(0);
});
