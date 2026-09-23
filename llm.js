import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

const llm = new ChatOpenAI({
    model: "openai/gpt-oss-120b",
    configuration: { baseURL: process.env.OPENROUTER_ENDPOINT },
    apiKey: process.env.OPENROUTER_API_KEY
});

const embeddings = new OpenAIEmbeddings({
    model: process.env.AI_EMBEDDING_MODEL,
    configuration: { baseURL: process.env.OPENROUTER_ENDPOINT },
    apiKey: process.env.OPENROUTER_API_KEY
});

export { llm, embeddings };