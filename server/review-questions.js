// Open questions raised by the automatic review, and the facts his answers become.
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const QUESTIONS_FILE = path.join(APP_DIR, 'data', 'review-questions.json');
export const ANSWERS_FILE = path.resolve(APP_DIR, '..', 'Project Notes', 'candidate-facts', 'review-answers.md');
const MAX_OPEN_PER_ENTRY = 3;

async function load(file) {
  try {
    return JSON.parse(await fsPromises.readFile(file, 'utf8'));
  } catch {
    return [];
  }
}

async function save(file, list) {
  const tmp = `${file}.tmp`;
  await fsPromises.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fsPromises.rename(tmp, file);
}

// Skips a question already open or answered for the same entry+factKey, and caps open ones per entry.
export async function addQuestions(entry, questions, { file = QUESTIONS_FILE } = {}) {
  const list = await load(file);
  const added = [];
  for (const q of questions) {
    if (!q?.question || !q.factKey) continue;
    const open = list.filter((x) => x.entryId === entry.id && x.status === 'open').length;
    if (open >= MAX_OPEN_PER_ENTRY) break;
    if (list.some((x) => x.entryId === entry.id && x.factKey === q.factKey)) continue;
    const item = {
      id: Math.random().toString(36).slice(2, 8),
      entryId: entry.id,
      label: `${entry.company} ${entry.role}`,
      question: String(q.question).slice(0, 300),
      factKey: String(q.factKey).slice(0, 60),
      factYes: String(q.factYes || '').slice(0, 300),
      factNo: String(q.factNo || '').slice(0, 300),
      status: 'open',
      telegramMessageId: null,
      createdAt: Date.now(),
    };
    list.push(item);
    added.push(item);
  }
  if (added.length) await save(file, list);
  return added;
}

export async function setMessageId(id, messageId, { file = QUESTIONS_FILE } = {}) {
  const list = await load(file);
  const q = list.find((x) => x.id === id);
  if (q) {
    q.telegramMessageId = messageId;
    await save(file, list);
  }
}

export async function findByMessageId(messageId, { file = QUESTIONS_FILE } = {}) {
  return (await load(file)).find((x) => x.telegramMessageId === messageId && x.status === 'open') || null;
}

export async function listOpen({ file = QUESTIONS_FILE } = {}) {
  return (await load(file)).filter((x) => x.status === 'open');
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

/**
 * answer: 'y' | 'n' | free text. Returns the saved question, or null for an unknown or already-answered id.
 * A second tap is a no-op, so a double-tap cannot write the fact twice.
 */
export async function answerQuestion(id, answer, { file = QUESTIONS_FILE, answersFile = ANSWERS_FILE, now = new Date() } = {}) {
  const list = await load(file);
  const q = list.find((x) => x.id === id);
  if (!q || q.status !== 'open') return null;
  let tag;
  let text;
  if (answer === 'y' || answer === 'n') {
    tag = answer === 'y' ? 'CONFIRMED' : 'NOT-DONE';
    text = answer === 'y' ? q.factYes : q.factNo;
    if (!text) text = `${answer === 'y' ? 'Yes' : 'No'}: ${q.question}`;
  } else {
    tag = 'CONFIRMED';
    text = `${q.question} Answer in his words: ${answer}`;
  }
  const line = `- [${now.toISOString().slice(0, 10)}] ${tag} (${q.label}): ${oneLine(text)} <!--rq:${q.id}-->\n`;
  await fsPromises.mkdir(path.dirname(answersFile), { recursive: true });
  let body = '';
  try {
    body = await fsPromises.readFile(answersFile, 'utf8');
  } catch {
    body = '# Review answers\n\nFacts Jordan confirmed or denied in reply to review questions. NOT-DONE means he has not done it: never claim it.\n\n';
  }
  await fsPromises.writeFile(answersFile, body + line, 'utf8');
  q.status = tag === 'NOT-DONE' ? 'denied' : 'confirmed';
  q.answeredAt = Date.now();
  await save(file, list);
  return { ...q, tag, fact: oneLine(text) };
}

export async function undoAnswer(id, { file = QUESTIONS_FILE, answersFile = ANSWERS_FILE } = {}) {
  const list = await load(file);
  const q = list.find((x) => x.id === id);
  if (!q || q.status === 'open') return null;
  try {
    const kept = (await fsPromises.readFile(answersFile, 'utf8')).split('\n').filter((l) => !l.includes(`<!--rq:${id}-->`));
    await fsPromises.writeFile(answersFile, kept.join('\n'), 'utf8');
  } catch {
    // nothing written yet
  }
  q.status = 'open';
  delete q.answeredAt;
  await save(file, list);
  return q;
}
