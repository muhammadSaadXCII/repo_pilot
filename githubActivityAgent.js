const { llm } = require("./llm");
const mcpClient = require("./github");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");

// Only pull in the tools this agent actually needs — not all 80+ GitHub tools.
// Keeping the tool list small helps the model choose correctly and keeps context small.
const RELEVANT_TOOL_NAMES = ["list_commits", "get_commit", "get_file_contents", "list_issues", "list_pull_requests"];

async function createGithubActivityAgent() {
    const allTools = await mcpClient.getTools();
    const tools = allTools.filter((t) => RELEVANT_TOOL_NAMES.includes(t.name));

    if (tools.length === 0) {
        throw new Error("No matching MCP tools found — check tool names against what mcpClient.getTools() actually returns.");
    }

    return createReactAgent({
        llm,
        tools,
        prompt: `You answer questions about GitHub repository activity: recent commits, who changed what, open issues, and pull requests.
You are NOT for explaining how code works — only for reporting on repo activity and metadata.
Always ask for or infer the owner/repo from context; if missing, say you need a repo to look at.`,
    });
}

module.exports = { createGithubActivityAgent };