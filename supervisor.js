import z from "zod";
import fs from 'fs';
import { llm } from './llm.js';
import { createCodeSearchAgent } from './agents/codeSearchAgent.js';
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { createDocGenAgent, docToMarkdown } from './agents/docGenAgent.js';
import { createGithubActivityAgent } from './agents/githubActivityAgent.js';
import { Annotation, END, interrupt, START, StateGraph } from "@langchain/langgraph";

const checkpointer = SqliteSaver.fromConnString('./repopilot-checkpoints.db');

const SupervisorState = Annotation.Root({
    question: Annotation(),
    answer: Annotation(),
    repoContext: Annotation(), // { repoPath, owner, repo }
    generatedDoc: Annotation(),
    approved: Annotation(),
});

// --- Cache agents so we don't rebuild the vector index or reload MCP tools on every question ---
const codeSearchAgents = new Map(); // keyed by repoPath
let githubActivityAgentPromise = null;
const docGenAgents = new Map();

function getCodeSearchAgent(repoPath) {
    if (!codeSearchAgents.has(repoPath)) {
        codeSearchAgents.set(repoPath, createCodeSearchAgent(repoPath, checkpointer)); // CHANGED
    }
    return codeSearchAgents.get(repoPath);
}

function getGithubActivityAgent() {
    if (!githubActivityAgentPromise) {
        githubActivityAgentPromise = createGithubActivityAgent(checkpointer);
    }
    return githubActivityAgentPromise;
}

function getDocGenAgent(repoPath) {
    if (!docGenAgents.has(repoPath)) {
        docGenAgents.set(repoPath, createDocGenAgent(repoPath, checkpointer)); // CHANGED
    }
    return docGenAgents.get(repoPath);
}

function containsKeyword(text, keywords) {
    return keywords.some((k) => {
        if (k.includes(" ")) return text.includes(k);
        const pattern = new RegExp(`\\b${k}\\b`);
        return pattern.test(text);
    });
}

const RouteDecision = z.object({
    route: z.enum(["docGenNode", "githubActivityNode", "codeSearchNode", "generalNode"]),
});

async function routeQuestion(state) {
    const structuredLlm = llm.withStructuredOutput(RouteDecision);
    const result = await structuredLlm.invoke([
        {
            role: "system",
            content: `Classify the user's question into exactly one category:
- docGenNode: user wants generated onboarding documentation or a written guide for the codebase
- githubActivityNode: about GitHub activity — commits, issues, pull requests, who changed what, recent changes
- codeSearchNode: about how the code works, its structure, purpose, logic, functions, classes — including general questions like "what is this codebase" or "what does this project do"
- generalNode: greetings, small talk, or anything unrelated to this specific repository`,
        },
        { role: "user", content: state.question },
    ]);
    console.log(result.route);

    return result.route;
}

async function codeSearchNode(state, config) { // CHANGED — accept config
    const repoPath = state.repoContext?.repoPath;
    if (!repoPath) {
        return { answer: "I need a local repo path (repoContext.repoPath) to search code." };
    }
    const agent = getCodeSearchAgent(repoPath);
    const result = await agent.invoke(
        { messages: [{ role: "user", content: state.question }] },
        config // CHANGED
    );
    return { answer: result.messages.at(-1).content };
}

async function githubActivityNode(state, config) {
    const agent = await getGithubActivityAgent();
    const { owner, repo } = state.repoContext || {};
    const contextPrefix = owner && repo ? `(Repository: ${owner}/${repo}) ` : "";
    const result = await agent.invoke(
        { messages: [{ role: "user", content: contextPrefix + state.question }] },
        config
    );
    return { answer: result.messages.at(-1).content };
}

async function docGenNode(state, config) { // CHANGED — accept config
    const repoPath = state.repoContext?.repoPath;
    if (!repoPath) {
        return { answer: "I need a local repo path (repoContext.repoPath) to generate docs." };
    }
    const agent = getDocGenAgent(repoPath);
    const result = await agent.invoke(
        { messages: [{ role: "user", content: state.question }] },
        config // CHANGED
    );
    return { generatedDoc: docToMarkdown(result.structuredResponse) };
}

function approveDoc(state) {
    const decision = interrupt({ preview: state.generatedDoc });
    console.log(decision);

    return { approved: decision.approved };
}

async function writeDocNode(state) {
    if (!state.approved) {
        return { answer: "Doc generation cancelled — not approved." };
    }

    const outPath = `./generated-docs/${Date.now()}-onboarding.md`;
    fs.mkdirSync("./generated-docs", { recursive: true });
    fs.writeFileSync(outPath, state.generatedDoc);
    return { answer: `Doc approved and saved to ${outPath}\n\n${state.generatedDoc}` };
}

async function generalNode(state) {
    const { owner, repo } = state.repoContext || {};
    const repoLabel = owner && repo ? `${owner}/${repo}` : "the connected repository";

    const response = await llm.invoke([
        {
            role: "system", content: `You are RepoPilot, an AI assistant that helps developers understand and work with the "${repoLabel}" codebase.

You handle general conversation, greetings, and questions that don't fit your specialized capabilities. Your specialized capabilities — handled elsewhere, not by you — are:
- Explaining how the code works, its structure, and logic
- Reporting on GitHub activity: commits, issues, and pull requests
- Generating onboarding documentation for the codebase

If the user's message is a greeting or small talk, respond warmly and briefly mention what you can help with for this repo.
If the user asks something clearly related to code, GitHub activity, or documentation that seems to have been misrouted here, let them know you didn't quite catch that and ask them to rephrase — don't try to answer it yourself without real information.
Keep responses brief — a sentence or two.`
        },
        { role: "human", content: state.question },
    ]);
    return { answer: response.content };
}

const supervisor = new StateGraph(SupervisorState)
    .addNode("codeSearchNode", codeSearchNode)
    .addNode("githubActivityNode", githubActivityNode)
    .addNode("docGenNode", docGenNode)
    .addNode("approveDoc", approveDoc)
    .addNode("writeDocNode", writeDocNode)
    .addNode("generalNode", generalNode)
    .addConditionalEdges(START, routeQuestion, {
        codeSearchNode: "codeSearchNode",
        githubActivityNode: "githubActivityNode",
        docGenNode: "docGenNode",
        generalNode: "generalNode",
    })
    .addEdge("codeSearchNode", END)
    .addEdge("githubActivityNode", END)
    .addEdge("docGenNode", "approveDoc")
    .addEdge("approveDoc", "writeDocNode")
    .addEdge("writeDocNode", END)
    .addEdge("generalNode", END)
    .compile({ checkpointer });

export { supervisor };