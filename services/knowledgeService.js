// Simple RAG: load knowledge.md and pass it whole into the assistant prompt.

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, '..', 'knowledge.md');

let cachedKnowledge = null;

export async function loadKnowledgeBase() {
  if (cachedKnowledge !== null) return cachedKnowledge;
  try {
    cachedKnowledge = await readFile(KNOWLEDGE_PATH, 'utf8');
  } catch (err) {
    console.error('[Knowledge] Failed to load knowledge.md:', err.message);
    cachedKnowledge = '';
  }
  return cachedKnowledge;
}

export function clearKnowledgeCache() {
  cachedKnowledge = null;
}
