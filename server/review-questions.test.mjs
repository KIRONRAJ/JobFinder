import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addQuestions, setMessageId, findByMessageId, answerQuestion, undoAnswer, listOpen } from './review-questions.js';

async function tmp() {
  const d = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'rq-'));
  return { file: path.join(d, 'q.json'), answersFile: path.join(d, 'facts', 'review-answers.md') };
}
const entry = { id: 'e1', company: 'Fujitsu', role: 'Tech' };
const q = (k) => ({ question: `Did ${k}?`, factKey: k, factYes: `Did ${k}.`, factNo: `Never did ${k}.` });

test('addQuestions dedupes by factKey and caps open questions at 3', async () => {
  const p = await tmp();
  const a = await addQuestions(entry, [q('a'), q('a'), q('b'), q('c'), q('d')], p);
  assert.deepEqual(a.map((x) => x.factKey), ['a', 'b', 'c']);
  assert.equal((await addQuestions(entry, [q('e')], p)).length, 0);
});

test('button answer writes the fact once; a second tap is a no-op; undo removes the line', async () => {
  const p = await tmp();
  const [item] = await addQuestions(entry, [q('laptop')], p);
  const res = await answerQuestion(item.id, 'n', p);
  assert.equal(res.tag, 'NOT-DONE');
  assert.equal(await answerQuestion(item.id, 'y', p), null);
  const md = await fsPromises.readFile(p.answersFile, 'utf8');
  assert.match(md, /NOT-DONE \(Fujitsu Tech\): Never did laptop\./);
  assert.equal((md.match(/rq:/g) || []).length, 1);
  assert.equal((await listOpen(p)).length, 0);
  await undoAnswer(item.id, p);
  assert.doesNotMatch(await fsPromises.readFile(p.answersFile, 'utf8'), /Never did laptop/);
  assert.equal((await listOpen(p)).length, 1);
});

test('reply by message id resolves the same question as a button; unknown ids are no-ops', async () => {
  const p = await tmp();
  const [item] = await addQuestions(entry, [q('imaging')], p);
  await setMessageId(item.id, 777, p);
  const found = await findByMessageId(777, p);
  assert.equal(found.id, item.id);
  const res = await answerQuestion(found.id, 'Did imaging at Cascade for a month', p);
  assert.equal(res.tag, 'CONFIRMED');
  assert.match(await fsPromises.readFile(p.answersFile, 'utf8'), /in his words: Did imaging at Cascade/);
  assert.equal(await findByMessageId(777, p), null);
  assert.equal(await answerQuestion('nope', 'y', p), null);
  assert.equal(await undoAnswer('nope', p), null);
});
