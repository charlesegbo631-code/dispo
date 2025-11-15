import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend from /public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// In-memory inbox storage
let inbox = {};

// Generate email function
function generateEmail() {
  const rand = Math.random().toString(36).substring(2, 12);
  return `${rand}@yourdomain.com`;
}

// Auto-delete emails older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (let email in inbox) {
    inbox[email] = inbox[email].filter(msg => now - msg.time < 10 * 60 * 1000);
  }
}, 30 * 1000);

// WebSocket server for live updates
const wss = new WebSocketServer({ noServer: true });
let clients = {}; 
// clients[email] = [ws, ws, ws...]

// Handle WebSocket upgrade
const port = process.env.PORT || 4000; // Using dynamic port
const server = app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const email = new URL(req.url, `http://${req.headers.host}`).searchParams.get("email");

    if (!clients[email]) clients[email] = [];
    clients[email].push(ws);

    ws.on("close", () => {
      clients[email] = clients[email].filter(c => c !== ws);
    });
  });
});

// Broadcast new email to WebSocket clients
function broadcast(email, message) {
  if (!clients[email]) return;
  clients[email].forEach(ws => ws.send(JSON.stringify(message)));
}

// Generate email route
app.get("/api/generate-email", (req, res) => {
  const email = generateEmail();
  inbox[email] = [];
  res.json({ email });
});

// Receive email via webhook (Mailgun)
app.post("/email/receive", (req, res) => {
  const data = req.body;
  const email = data.recipient;

  if (!inbox[email]) inbox[email] = [];

  const msg = {
    from: data.sender || "Unknown",
    subject: data.subject || "(No subject)",
    body: data["body-plain"] || "",
    time: Date.now(),
  };

  inbox[email].push(msg);

  // Push email instantly to WebSocket clients
  broadcast(email, msg);

  console.log("📩 New email received for", email);
  res.send("OK");
});

// Fetch inbox for frontend
app.get("/api/inbox", (req, res) => {
  const email = req.query.email;
  res.json(inbox[email] || []);
});
