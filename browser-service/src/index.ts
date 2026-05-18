import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { captureSiteSafe, CaptureRequest } from "./capture";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

app.post("/capture", async (req, res) => {
  const body = (req.body || {}) as CaptureRequest;
  const { target_url } = body;
  if (!target_url) {
    return res.status(400).json({ error: "target_url required" });
  }

  const result = await captureSiteSafe(body);
  return res.json(result);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`browser-service listening on ${port}`);
});
