const { llm } = require("./llm");
const { createCodeSearchAgent } = require("./codeSearchAgent");
const { createDocGenAgent, docToMarkdown } = require("./docGenAgent");
const { createGithubActivityAgent } = require("./githubActivityAgent");
const { MemorySaver, interrupt, Command } = require("@langchain/langgraph");
const { StateGraph, Annotation, START, END } = require("@langchain/langgraph");
const { SqliteSaver } = require("@langchain/langgraph-checkpoint-sqlite");

const checkpointer = new SqliteSaver.fromConnString('./repopilot-checkpoints.db');

const SupervisorState = Annotation.Root({
    question: Annotation(),
    answer: Annotation(),
    repoContext: Annotation(), // { repoPath, owner, repo }
    generatedDoc: Annotation(),   // NEW
    approved: Annotation(),       // NEW
});

// --- Cache agents so we don't rebuild the vector index or reload MCP tools on every question ---
const codeSearchAgents = new Map(); // keyed by repoPath
let githubActivityAgentPromise = null;
const docGenAgents = new Map();

function getCodeSearchAgent(repoPath) {
    if (!codeSearchAgents.has(repoPath)) {
        codeSearchAgents.set(repoPath, createCodeSearchAgent(repoPath));
    }
    return codeSearchAgents.get(repoPath);
}

function getGithubActivityAgent() {
    if (!githubActivityAgentPromise) {
        githubActivityAgentPromise = createGithubActivityAgent();
    }
    return githubActivityAgentPromise;
}

function getDocGenAgent(repoPath) {
    if (!docGenAgents.has(repoPath)) {
        docGenAgents.set(repoPath, createDocGenAgent(repoPath));
    }
    return docGenAgents.get(repoPath);
}

function containsKeyword(text, keywords) {
    return keywords.some((k) => {
        // Multi-word phrases (e.g. "pull request") are safe as substrings.
        // Single short words need word-boundary matching to avoid false hits like "project" containing "pr".
        if (k.includes(" ")) return text.includes(k);
        const pattern = new RegExp(`\\b${k}\\b`);
        return pattern.test(text);
    });
}

// --- Router: simple keyword matching, per the guide — upgrade later only if this proves brittle ---
function routeQuestion(state) {
    const q = state.question.toLowerCase();

    const docGenKeywords = ["onboarding", "document", "generate a guide"];
    const activityKeywords = ["commit", "commits", "issue", "issues", "pull request", "pr", "activity", "who changed", "who touched", "recent change"];
    const codeKeywords = ["how does", "how do", "explain", "what does", "function", "class", "implement", "work", "structure", "logic"];

    if (containsKeyword(q, docGenKeywords)) return "docGenNode";
    if (containsKeyword(q, activityKeywords)) return "githubActivityNode";
    if (containsKeyword(q, codeKeywords)) return "codeSearchNode";
    return "generalNode";
}


// --- Nodes: translate supervisor state IN, run sub-agent, translate OUT ---
async function codeSearchNode(state) {
    const repoPath = state.repoContext?.repoPath;
    if (!repoPath) {
        return { answer: "I need a local repo path (repoContext.repoPath) to search code." };
    }
    const agent = getCodeSearchAgent(repoPath);
    const result = await agent.invoke({ messages: [{ role: "user", content: state.question }] });
    return { answer: result.messages.at(-1).content };
}

async function githubActivityNode(state) {
    const agent = await getGithubActivityAgent();
    const { owner, repo } = state.repoContext || {};
    const contextPrefix = owner && repo ? `(Repository: ${owner}/${repo}) ` : "";
    const result = await agent.invoke({
        messages: [{ role: "user", content: contextPrefix + state.question }],
    });
    return { answer: result.messages.at(-1).content };
}

async function docGenNode(state) {
    const repoPath = state.repoContext?.repoPath;
    if (!repoPath) {
        return { answer: "I need a local repo path (repoContext.repoPath) to generate docs." };
    }
    const agent = getDocGenAgent(repoPath);
    const result = await agent.invoke({ messages: [{ role: "user", content: state.question }] });
    return { generatedDoc: docToMarkdown(result.structuredResponse) };
}

// Node 2: PAUSE and show the preview
function approveDoc(state) {
    const decision = interrupt({ preview: state.generatedDoc });
    return { approved: decision.approved };
}

// Node 3: act on the decision
async function writeDocNode(state) {
    if (!state.approved) {
        return { answer: "Doc generation cancelled — not approved." };
    }
    const fs = require("fs");
    const outPath = `./generated-docs/${Date.now()}-onboarding.md`;
    fs.mkdirSync("./generated-docs", { recursive: true });
    fs.writeFileSync(outPath, state.generatedDoc);
    return { answer: `Doc approved and saved to ${outPath}\n\n${state.generatedDoc}` };
}

async function generalNode(state) {
    const response = await llm.invoke([
        { role: "system", content: "You are a helpful assistant. Answer briefly." },
        { role: "human", content: state.question },
    ]);
    return { answer: response.content };
}

// --- Graph ---
const supervisor = new StateGraph(SupervisorState)
    .addNode("codeSearchNode", codeSearchNode)
    .addNode("githubActivityNode", githubActivityNode)
    .addNode("docGenNode", docGenNode)
    .addNode("approveDoc", approveDoc)         // NEW
    .addNode("writeDocNode", writeDocNode)     // NEW
    .addNode("generalNode", generalNode)
    .addConditionalEdges(START, routeQuestion, {
        codeSearchNode: "codeSearchNode",
        githubActivityNode: "githubActivityNode",
        docGenNode: "docGenNode",
        generalNode: "generalNode",
    })
    .addEdge("codeSearchNode", END)
    .addEdge("githubActivityNode", END)
    .addEdge("docGenNode", "approveDoc")       // CHANGED — was ("docGenNode", END)
    .addEdge("approveDoc", "writeDocNode")     // NEW
    .addEdge("writeDocNode", END)              // NEW
    .addEdge("generalNode", END)
    .compile({ checkpointer });

module.exports = { supervisor };