import test from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cleanTextForSpeech,
  AVAILABLE_VOICES,
  DEFAULT_VOICE_KEY,
  resolveVoiceId,
  getVoiceSetting,
  setVoiceSetting,
  createSpokenBriefingText,
} from './tts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'voice-settings.test.json');

test('cleanTextForSpeech: strips markdown formatting, links, bullets, and emojis', () => {
  const input = '# Briefing\n• **Datacom** — [Link](https://seek.co.nz) `aws-cli` 🚀\n```js\nconsole.log(1)\n```';
  const cleaned = cleanTextForSpeech(input);
  assert.equal(cleaned.includes('#'), false);
  assert.equal(cleaned.includes('**'), false);
  assert.equal(cleaned.includes('http'), false);
  assert.equal(cleaned.includes('console.log'), false);
  assert.equal(cleaned.includes('🚀'), false);
  assert.ok(cleaned.includes('Datacom'));
  assert.ok(cleaned.includes('aws-cli'));
});

test('AVAILABLE_VOICES: exposes required personalities including Jarvis, Prabhat, and Mitchell', () => {
  assert.ok(AVAILABLE_VOICES.jarvis);
  assert.equal(AVAILABLE_VOICES.jarvis.id, 'en-GB-ThomasNeural');
  assert.ok(AVAILABLE_VOICES.prabhat);
  assert.equal(AVAILABLE_VOICES.prabhat.id, 'en-IN-PrabhatNeural');
  assert.ok(AVAILABLE_VOICES.mitchell);
  assert.equal(AVAILABLE_VOICES.mitchell.id, 'en-NZ-MitchellNeural');
});

test('resolveVoiceId: resolves key or falls back correctly', () => {
  assert.equal(resolveVoiceId('jarvis'), 'en-GB-ThomasNeural');
  assert.equal(resolveVoiceId('PRABHAT'), 'en-IN-PrabhatNeural');
  assert.equal(resolveVoiceId('en-US-GuyNeural'), 'en-US-GuyNeural');
  assert.equal(resolveVoiceId(null), AVAILABLE_VOICES[DEFAULT_VOICE_KEY].id);
});

test('setVoiceSetting and getVoiceSetting: persists chosen voice key', async () => {
  await setVoiceSetting('prabhat', TEST_SETTINGS_FILE);
  const setting = await getVoiceSetting(TEST_SETTINGS_FILE);
  assert.equal(setting.voiceKey, 'prabhat');
  assert.equal(setting.voiceId, 'en-IN-PrabhatNeural');

  // Reset to default
  await setVoiceSetting(DEFAULT_VOICE_KEY, TEST_SETTINGS_FILE);
  const reset = await getVoiceSetting(TEST_SETTINGS_FILE);
  assert.equal(reset.voiceKey, DEFAULT_VOICE_KEY);

  await fsPromises.rm(TEST_SETTINGS_FILE, { force: true }).catch(() => {});
});

test('createSpokenBriefingText: creates a polite, natural spoken briefing', () => {
  const mockApps = [
    { company: 'Datacom', role: 'Cloud Engineer', status: 'interview' },
    { company: 'Spark', role: 'DevOps Lead', status: 'applied', followUpDue: '2026-10-08' },
  ];
  const now = new Date('2026-10-08T08:30:00Z');
  const text = createSpokenBriefingText(mockApps, now);
  assert.ok(text.includes('Good morning'));
  assert.ok(text.includes('Datacom'));
  assert.ok(text.includes('Spark'));
  assert.ok(text.toLowerCase().includes('standing by'));
});
