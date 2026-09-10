import express from "express";
import dotenv from "dotenv";
import path from "path";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { loadMemory, saveMemory } from "./memory/memoryStore.js";

dotenv.config();

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Gemini SDK
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is missing in .env");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased limit for images
app.use(express.static(path.join(__dirname, "../public")));

// Rate Limit (Prevent abuse)
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 15 // Limit each IP to 15 requests per min
});
app.use("/api", limiter);

// --- Helpers ---

// Debounce memory updates to save quota
let memoryUpdateQueue = null;
const updateMemoryAsync = async (sessionId, history) => {
    if (history.length < 4) return; // Only summarize if enough context
    
    // Simple logic: If we have new chats, update summary
    try {
        const memory = await loadMemory(sessionId);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Use flash for cheap summaries
        
        const prompt = `Analyze this conversation and update the user profile JSON. 
        Current Memory: ${JSON.stringify(memory)}
        New Conversation: ${JSON.stringify(history.slice(-4))}
        Return ONLY the updated JSON structure for profile, project, and technical.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // Basic JSON extraction cleanup
        const jsonStr = text.replace(/```json|```/g, "").trim();
        const updates = JSON.parse(jsonStr);
        
        await saveMemory(sessionId, updates);
        console.log(`🧠 Memory updated in background for session: ${sessionId}`);
    } catch (e) {
        console.error("Memory update skipped:", e.message);
    }
};

// --- API Routes ---

app.post("/api/generate-stream", async (req, res) => {
    try {
        const { message, history, model, image, sessionId } = req.body;

        const modelMap = {
          "gemini-2.5-flash": "gemini-2.5-flash",
          "gemini-2.5-pro": "gemini-2.5-pro"
        };

        const selectedModel = modelMap[model] || "gemini-2.5-flash";

        console.log(`🤖 Using model: ${selectedModel} for session: ${sessionId || "default"}`);

        // 1. Setup Stream Headers (SSE)
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // 2. Load Memory Context
        const memory = await loadMemory(sessionId);
        const systemInstruction = `
            You are a helpful AI Assistant.
            User Context: ${JSON.stringify(memory.profile)}
            Current Project: ${JSON.stringify(memory.project)}
            Technical Context: ${JSON.stringify(memory.technical)}
            Be concise, helpful, and friendly.
        `;

        // 3. Prepare Chat
        const chatModel = genAI.getGenerativeModel({ 
            model: selectedModel,
            systemInstruction: systemInstruction
        });

        // 4. Handle Content (Text + Image)
        let parts = [{ text: message }];
        if (image) {
            parts.push(image); // image object is { inlineData: { data, mimeType } }
        }

        // 5. Start Streaming
        // Note: For multimodal, we usually use generateContentStream, for text-only chat we use startChat
        let result;
        
        if (image) {
            // Single turn multimodal
            result = await chatModel.generateContentStream(parts);
        } else {
            // Text chat with history
            const chat = chatModel.startChat({
                history: history || [],
            });
            result = await chat.sendMessageStream(message);
        }

        // 6. Pipe Chunks to Client
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            res.write(`data: ${JSON.stringify(chunkText)}\n\n`);
        }

        res.write("data: [DONE]\n\n");
        res.end();

        // 7. Background Memory Update
        updateMemoryAsync(sessionId, history);

    } catch (error) {
        console.error("Stream Error:", error);
        res.write(`data: ${JSON.stringify("Error: " + error.message)}\n\n`);
        res.end();
    }
});

app.get("/health", (req, res) => res.json({ status: "OK", timestamp: new Date() }));

/// Fallback for SPA (Universal method - bypasses regex parser issues)
app.use((req, res, next) => {
    // Check if the request is for a file (like CSS/JS) or API, skip if so
    if (req.path.startsWith("/api") || req.path.includes(".")) {
         return next();
    }
    // Otherwise serve the HTML
    res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});