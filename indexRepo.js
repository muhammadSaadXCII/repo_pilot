const fs = require("fs");
const path = require("path");
const { embeddings } = require("./llm");
const { HNSWLib } = require("@langchain/community/vectorstores/hnswlib");
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

async function buildVectorStore(docs) {
    const vectorStore = await HNSWLib.fromDocuments(docs, embeddings);
    return vectorStore;
}

async function buildVectorStoreFromRepo(repoPath) {
    const files = getAllCodeFiles(repoPath);
    const docs = await chunkFiles(files);
    return await buildVectorStore(docs);
}

async function saveIndex(vectorStore, repoName) {
    await vectorStore.save(`./indexes/${repoName}`);
}

async function loadIndex(repoName) {
    return await HNSWLib.load(`./indexes/${repoName}`, embeddings);
}

module.exports = { buildVectorStore, buildVectorStoreFromRepo, saveIndex, loadIndex };