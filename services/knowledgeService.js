// Simple RAG: load knowledge.md on every assistant request.

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, '..', 'knowledge.md');

export async function loadKnowledgeBase() {
  try {
    return await readFile(KNOWLEDGE_PATH, 'utf8');
  } catch (err) {
    console.error('[Knowledge] Failed to load knowledge.md:', err.message);
    return '';
  }
}
