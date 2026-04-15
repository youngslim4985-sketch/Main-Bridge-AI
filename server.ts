import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Enterprise Layer API - Simulating the "Java Service"
  app.post("/api/enterprise/validate", (req, res) => {
    const { amount, merchant, timestamp } = req.body;
    
    // Simulate enterprise validation logic
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid transaction amount" });
    }

    console.log(`[Enterprise Layer] Validating transaction: $${amount} at ${merchant}`);
    
    // Return "Enriched" data for the AI layer
    res.json({
      status: "validated",
      transactionId: `TX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      enrichedData: {
        ...req.body,
        riskScore_Base: amount > 500 ? 0.4 : 0.1,
        enterpriseCheck: "PASSED"
      }
    });
  });

  // System Health
  app.get("/api/health", (req, res) => {
    res.json({ status: "UP", layer: "Enterprise (Node.js/Express)" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MainBridge AI Server running on http://localhost:${PORT}`);
  });
}

startServer();
