require('dotenv').config();
const express = require("express");
const { supervisor } = require("./supervisor");
const { mcpClient } = require("./github");
const { Command } = require("@langchain/langgraph");
const { buildThreadId } = require("./threadId");

const app = express();
app.use(express.json());

function buildConfig(userId, owner, repo) {
    return {
        configurable: { thread_id: buildThreadId(userId, owner, repo) },
        recursionLimit: 50,
    };
}

function formatInterrupt(response) {
    const payload = response.__interrupt__[0].value;
    if (payload.preview) {
        return { interrupted: true, kind: "docPreview", preview: payload.preview };
    }
    if (payload.action) {
        return { interrupted: true, kind: "actionApproval", action: payload.action, details: payload.details };
    }
    return { interrupted: true, kind: "unknown", payload };
}

// POST /ask — { userId, owner, repo, repoPath, question }
app.post("/ask", async (req, res) => {
    try {
        const { userId, owner, repo, repoPath, question } = req.body;
        if (!userId || !owner || !repo || !question) {
            return res.status(400).json({ error: "userId, owner, repo, and question are required" });
        }

        const config = buildConfig(userId, owner, repo);
        const repoContext = { repoPath: repoPath || repo, owner, repo };

        const response = await supervisor.invoke({ question, repoContext }, config);

        if (response.__interrupt__) {
            return res.json(formatInterrupt(response));
        }
        return res.json({ answer: response.answer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// POST /resume — { userId, owner, repo, approved }
app.post("/resume", async (req, res) => {
    try {
        const { userId, owner, repo, approved } = req.body;
        if (!userId || !owner || !repo || typeof approved !== "boolean") {
            return res.status(400).json({ error: "userId, owner, repo, and approved (boolean) are required" });
        }

        const config = buildConfig(userId, owner, repo);
        const response = await supervisor.invoke(new Command({ resume: { approved } }), config);

        if (response.__interrupt__) {
            return res.json(formatInterrupt(response)); // a second interrupt can chain, same as the CLI
        }
        return res.json({ answer: response.answer });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// GET /history?userId=...&owner=...&repo=...
app.get("/history", async (req, res) => {
    try {
        const { userId, owner, repo } = req.query;
        if (!userId || !owner || !repo) {
            return res.status(400).json({ error: "userId, owner, and repo query params are required" });
        }

        const config = buildConfig(userId, owner, repo);
        const history = [];
        for await (const snapshot of supervisor.getStateHistory(config)) {
            history.push({
                values: snapshot.values,
                next: snapshot.next,
                createdAt: snapshot.createdAt,
            });
        }
        res.json({ history });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const port = process.env.PORT;
app.listen(port, () => {
    console.log(`RepoPilot API listening on http://localhost:${port}`)
});

process.on("SIGINT", async () => {
    await mcpClient.close();
    process.exit(0);
});