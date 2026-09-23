import z from 'zod';
import { tool } from '@langchain/core/tools';
import { interrupt } from '@langchain/langgraph';

const requestHumanApproval = tool(
    async ({ action, details }) => {
        const decision = interrupt({ action, details });
        return decision?.approved
            ? `Approved. Proceeding with: ${action}`
            : `Rejected by the user. Do not proceed with: ${action}`;
    },
    {
        name: "requestHumanApproval",
        description: "Call this BEFORE any consequential or irreversible action (writing a file, closing an issue, posting a comment). Pauses execution and asks a human to approve or reject.",
        schema: z.object({
            action: z.string().describe("Short description of the action you want to take"),
            details: z.string().describe("Relevant details the human needs to decide"),
        }),
    }
);

export { requestHumanApproval };