const { MultiServerMCPClient } = require("@langchain/mcp-adapters");

const mcpClient = new MultiServerMCPClient({
    github: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN
        }
    }
});

module.exports = mcpClient;