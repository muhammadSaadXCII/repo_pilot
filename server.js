require('dotenv').config();
const { llm } = require('./llm');
const mcpClient = require("./github");
const { supervisor } = require("./supervisor");
const { createCodeSearchAgent } = require("./codeSearchAgent");
const { Command } = require('@langchain/langgraph');

(async () => {
    // const result = await llm.invoke([
    //     { role: "human", content: "Hi, there" }
    // ]);

    // const tools = await mcpClient.getTools();

    // console.log(tools.map((t) => {
    //     if (t.name.startsWith('list')) {
    //         return t.name;
    //     }
    //     return;
    // }));

    // const agent = createCodeSearchAgent("E:\\Node.js Projects\\repo_pilot_agent");
    // const result = await agent.stream({
    //     messages: [{ role: "user", content: "How does this project handle authentication?" }],
    // }, { streamMode: "messages" });
    // for await (const [messageChunk] of result) {
    //     if (messageChunk.content) process.stdout.write(messageChunk.content);
    // }

    const repoContext = {
        repoPath: __dirname,
        owner: "muhammadSaadXCII",
        repo: "Portfolio",
    };

    // const result = await supervisor.stream({
    //     question: "Generate an onboarding guide for the auth module",
    //     repoContext,
    // }, { streamMode: 'messages' });
    // for await (const [messageChunk] of result) {
    //     if (messageChunk.content) process.stdout.write(messageChunk.content);
    // }

    const config = { configurable: { thread_id: "doc-gen-1" } };

    // First call: runs until it hits interrupt(), then stops
    const paused = await supervisor.invoke(
        { question: "Generate an onboarding guide for the auth module", repoContext },
        config
    );
    console.log("PAUSED — preview:\n", paused.__interrupt__[0].value.preview);

    // ...imagine a human reads the preview here...

    // Resume with approval
    const final = await supervisor.invoke(new Command({ resume: { approved: false } }), config);
    console.log("\nFINAL:\n", final.answer);

    await mcpClient.close();
})();