import 'dotenv/config';
import readline from 'readline';
import { mcpClient } from './github.js';
import { supervisor } from './supervisor.js';
import { Command } from '@langchain/langgraph';
import { buildThreadId } from './indexRepo.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

const repoContext = {
    repoPath: import.meta.dirname,
    owner: "muhammadSaadXCII",
    repo: "repo_pilot",
};
const config = {
    configurable: { thread_id: buildThreadId('localdev', repoContext.owner, repoContext.repo) },
    recursionLimit: 50
};

async function main() {
    rl.question("You: ", async (input) => {
        const trimmed = input.trim();

        if (!trimmed) {
            main();
            return;
        }

        if (trimmed.toLowerCase() === 'e' ||
            trimmed.toLowerCase() === 'exit' ||
            trimmed.toLowerCase() === 'q' ||
            trimmed.toLowerCase() === 'quit'
        ) {
            for await (const state of supervisor.getStateHistory(config)) {
                console.log(state);
            }
            rl.close();
            return;
        }

        const response = await supervisor.invoke(
            { question: trimmed, repoContext },
            config
        );

        await handleInterrupt(response);
        main();
    });
}

async function handleInterrupt(response) {
    if (response.__interrupt__) {
        const payload = response.__interrupt__[0].value;

        if (payload.preview) {
            console.log("\n--- DOC PREVIEW ---\n");
            console.log(payload.preview);
            console.log("\n-------------------\n");
        } else if (payload.action) {
            console.log(`\n--- AGENT IS REQUESTING APPROVAL ---`);
            console.log(`Action: ${payload.action}`);
            console.log(`Details: ${payload.details}`);
            console.log("-------------------------------------\n");
        }

        const answer = await ask("Approve? (y/n): ");
        const approved = answer.trim().toLowerCase() === "y";

        const resumed = await supervisor.invoke(new Command({ resume: { approved } }), config);
        await handleInterrupt(resumed);
        return;
    }

    console.log(`\nAssistant: ${response.answer}\n`);
    // for await (const [messageChunk] of response) {
    //     if (messageChunk.content) process.stdout.write(messageChunk.content);
    // }
}

main();