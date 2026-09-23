import { MultiServerMCPClient } from '@langchain/mcp-adapters';

const mcpClient = new MultiServerMCPClient({
    mcpServers: {
        github: {
            transport: "http",
            url: "https://api.githubcopilot.com/mcp/",
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            },
        },
    },
});

export { mcpClient };