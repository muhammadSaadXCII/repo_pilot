const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { z } = require("zod");
const { llm } = require("./llm");
const { createSearchCodeTool } = require("./codeSearchAgent");

const OnboardingDoc = z.object({
    title: z.string(),
    sections: z.array(z.object({ heading: z.string(), content: z.string() })),
});

function createDocGenAgent(repoPath) {
    return createReactAgent({
        llm,
        tools: [createSearchCodeTool(repoPath)],
        prompt: `You generate onboarding documentation for a codebase.
Use the searchCode tool to gather real details before writing — never invent function or file names.
Structure your answer as a title and a few clear sections (e.g. Overview, Key Files, How It Works).
Base every section on what searchCode actually returned.`,
        responseFormat: OnboardingDoc,
    });
}

function docToMarkdown(doc) {
    const sections = doc.sections
        .map((s) => `## ${s.heading}\n\n${s.content}`)
        .join("\n\n");
    return `# ${doc.title}\n\n${sections}`;
}

module.exports = { createDocGenAgent, docToMarkdown };