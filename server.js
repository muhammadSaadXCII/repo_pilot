require('dotenv').config();
const mcpClient = require("./github");
const { supervisor } = require("./supervisor");
const { Command } = require('@langchain/langgraph');

(async () => {
    const repoContext = {
        repoPath: __dirname,
        owner: "muhammadSaadXCII",
        repo: "Portfolio",
    };

    const config = { configurable: { thread_id: "doc-gen-1" } };

    // First call: runs until it hits interrupt(), then stops
    const paused = await supervisor.invoke(
        { question: "Generate an onboarding guide for the auth module", repoContext },
        config
    );
    console.log("PAUSED — preview:\n", paused.__interrupt__[0].value.preview);

    // ...imagine a human reads the preview here...

    // Resume with rejection this time
    const final = await supervisor.invoke(new Command({ resume: { approved: false } }), config);
    console.log("\nFINAL:\n", final.answer);

    await mcpClient.close();
})();