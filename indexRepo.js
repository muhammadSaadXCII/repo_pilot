const fs = require("fs");
const path = require("path");
const { embeddings } = require("./llm");
const { Chroma } = require("@langchain/community/vectorstores/chroma");
const { RecursiveCharacterTextSplitter } = require("@langchain/classic/text_splitter");

function getAllCodeFiles(dir, exts = [".js", ".ts", ".jsx", ".tsx"]) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getAllCodeFiles(fullPath, exts));
        } else if (exts.includes(path.extname(entry.name))) {
            results.push(fullPath);
        }
    }
    return results;
}

function repoNameToCollectionName(repoPath) {
    return repoPath
        .replace(/[\\/:]/g, "_")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 63)
        .replace(/^[^a-zA-Z0-9]+/, "")
        .replace(/[^a-zA-Z0-9]+$/, "") || "repo";
}

async function chunkFiles(filePaths) {
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 100,
    });

    const docs = [];
    for (const filePath of filePaths) {
        const content = fs.readFileSync(filePath, "utf-8");
        const chunks = await splitter.createDocuments([content], [{ source: filePath }]);
        docs.push(...chunks);
    }
    return docs;
}

async function buildVectorStore(docs, repoPath) {
    const collectionName = repoNameToCollectionName(repoPath);
    const vectorStore = await Chroma.fromDocuments(docs, embeddings, {
        collectionName,
        collectionName,
        host: "localhost",
        port: 8000,
        ssl: false,
    });
    return vectorStore;
}

async function buildVectorStoreFromRepo(repoPath) {
    const files = getAllCodeFiles(repoPath);
    const docs = await chunkFiles(files);
    return await buildVectorStore(docs, repoPath);
}

async function loadIndex(repoPath) {
    const collectionName = repoNameToCollectionName(repoPath);
    return new Chroma(embeddings, { collectionName, host: "localhost", port: 8000, ssl: false });
}

module.exports = { buildVectorStore, buildVectorStoreFromRepo, loadIndex, repoNameToCollectionName };