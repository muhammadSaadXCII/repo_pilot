const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const { llm } = require("./llm");
const { buildVectorStoreFromRepo } = require("./indexRepo");

let vectorStorePromise = null;
function getVectorStore(repoPath) {
    if (!vectorStorePromise) {
        vectorStorePromise = buildVectorStoreFromRepo(repoPath);
    }
    return vectorStorePromise;
}

// NEW: pulled out so docGenAgent.js can reuse it too
function createSearchCodeTool(repoPath) {
    return tool(
        async ({ query }) => {
            const vectorStore = await getVectorStore(repoPath);
            const results = await vectorStore.similaritySearch(query, 4);
            return results
                .map((r) => `// From ${r.metadata.source}\n${r.pageContent}`)
                .join("\n\n---\n\n");
        },
        {
            name: "searchCode",
            description: "Semantically search the codebase for relevant code snippets. Use this when you need to see actual code to answer a question about how something works.",
            schema: z.object({ query: z.string() }),
        }
    );
}

function createCodeSearchAgent(repoPath) {
    return createReactAgent({
        llm,
        tools: [createSearchCodeTool(repoPath)],
        
        prompt: `You answer questions about a codebase's structure and behavior.
Only use the searchCode tool when you actually need to see code to answer accurately — for greetings or general questions, just answer directly.
Always cite which file(s) your answer came from, using the "// From ..." markers in the tool results.
If the question isn't about code, say you only handle code-structure questions.`,
    });
}

module.exports = { createCodeSearchAgent, createSearchCodeTool };