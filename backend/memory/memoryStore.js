import fs from "fs/promises"; // Use Promise-based FS
import path from "path";

const MEMORY_DIR = path.join(process.cwd(), "memory");

const EMPTY_MEMORY = {
    profile: { goal: "", preferences: "", confidence: 0, updatedAt: 0 },
    project: { name: "", techStack: "", status: "", confidence: 0, updatedAt: 0 },
    technical: { context: "", confidence: 0, updatedAt: 0 },
    summary: ""
};

// Ensure directory exists on startup
(async () => {
    try {
        await fs.mkdir(MEMORY_DIR, { recursive: true });
    } catch (err) {
        console.error("Memory Store Init Error:", err);
    }
})();

const getMemoryPath = (sessionId) => path.join(MEMORY_DIR, `memory_${sessionId || "default"}.json`);

export async function loadMemory(sessionId = "default") {
    try {
        const data = await fs.readFile(getMemoryPath(sessionId), "utf-8");
        return JSON.parse(data);
    } catch (err) {
        return EMPTY_MEMORY;
    }
}

export async function saveMemory(sessionId = "default", partialUpdate) {
    try {
        const current = await loadMemory(sessionId);
        const updated = {
            profile: { ...current.profile, ...(partialUpdate.profile || {}) },
            project: { ...current.project, ...(partialUpdate.project || {}) },
            technical: { ...current.technical, ...(partialUpdate.technical || {}) },
            summary: partialUpdate.summary || current.summary
        };

        await fs.writeFile(getMemoryPath(sessionId), JSON.stringify(updated, null, 2));
        return updated;
    } catch (err) {
        console.error("Failed to save memory:", err);
    }
}