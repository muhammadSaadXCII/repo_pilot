import z from "zod";
import { llm } from "../llm.js";
import { requestHumanApproval } from "../tools.js";
import { createSearchCodeTool } from "./codeSearchAgent.js";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

const OnboardingDoc = z.object({
    title: z.string(),
    sections: z.array(z.object({ heading: z.string(), content: z.string() })),
});

function createDocGenAgent(repoPath, checkpointer) {
    return createReactAgent({
        llm,
        tools: [createSearchCodeTool(repoPath), requestHumanApproval],
        prompt: `You generate onboarding documentation for a codebase.
Use the searchCode tool to gather real details before writing — never invent function or file names.
Structure your answer as a title and a few clear sections (e.g. Overview, Key Files, How It Works).
Base every section on what searchCode actually returned.`,
        responseFormat: OnboardingDoc,
        checkpointer
    });
}

function docToMarkdown(doc) {
    const sections = doc.sections
        .map((s) => `## ${s.heading}\n\n${s.content}`)
        .join("\n\n");
    return `# ${doc.title}\n\n${sections}`;
}

export { createDocGenAgent, docToMarkdown };