// Knowledge base loader: Google Sheets first, local markdown fallback.

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getKnowledgeFromSheets } from './bookingService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_PATH = path.join(__dirname, '..', 'knowledge.md');

export async function loadKnowledgeBundle() {
  try {
    const remote = await getKnowledgeFromSheets();
    const remoteText = String(remote.knowledge || '').trim();
    if (remoteText) {
      return { source: 'sheets', text: remoteText, items: remote.items || [] };
    }
  } catch (err) {
    console.error('[Knowledge] Failed to load from Sheets:', err.message);
  }

  try {
    const localText = await readFile(KNOWLEDGE_PATH, 'utf8');
    return { source: 'file', text: localText, items: [] };
  } catch (err) {
    console.error('[Knowledge] Failed to load knowledge.md:', err.message);
    return { source: 'none', text: '', items: [] };
  }
}

export async function loadKnowledgeBase() {
  const knowledge = await loadKnowledgeBundle();
  return knowledge.text;
}
