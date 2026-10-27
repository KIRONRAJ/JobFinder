// Speech synthesis service powered by Microsoft Edge Neural TTS.
// Zero strain on Homeserver, zero cost, human-quality neural voices.
// Supports native Telegram OGG Opus voice notes and Web MP3 streams.

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(APP_DIR, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'voice-settings.json');
const CACHE_DIR = path.join(DATA_DIR, 'voice-notes', 'cache');

export const AVAILABLE_VOICES = {
  jarvis: {
    id: 'en-GB-ThomasNeural',
    label: 'Jarvis (British Male)',
    description: 'Calm, cultured, sophisticated British accent',
    greeting: 'Good day, sir. Systems are online and fully operational.',
  },
  prabhat: {
    id: 'en-IN-PrabhatNeural',
    label: 'Prabhat (Indian Male)',
    description: 'Articulate, confident, professional Indian accent',
    greeting: 'Hello Jordan! Prabhat here. All systems are operational.',
  },
  mitchell: {
    id: 'en-NZ-MitchellNeural',
    label: 'Mitchell (Kiwi Male)',
    description: 'Natural New Zealand English male accent',
    greeting: 'Kia ora Jordan! Mitchell here, ready to tackle the day.',
  },
  molly: {
    id: 'en-NZ-MollyNeural',
    label: 'Molly (Kiwi Female)',
    description: 'Natural New Zealand English female accent',
    greeting: 'Kia ora Jordan! Molly here, all applications are tracked.',
  },
  ryan: {
    id: 'en-GB-RyanNeural',
    label: 'Ryan (British Male)',
    description: 'Crisp, modern British male accent',
    greeting: 'Hello sir, Ryan at your service. Ready for briefing.',
  },
  guy: {
    id: 'en-US-GuyNeural',
    label: 'Guy (American Male)',
    description: 'Clear, professional American English accent',
    greeting: 'Hey Jordan, Guy here. Systems are ready to roll.',
  },
};

export const DEFAULT_VOICE_KEY = 'jarvis';

/** Clean raw text/markdown into natural spoken text */
export function cleanTextForSpeech(raw = '') {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove markdown headings
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italics
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    // Remove bullet points / lists
    .replace(/^\s*[-*•+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Convert XML / SSML reserved characters so MsEdgeTTS never chokes
    .replace(/&/g, ' and ')
    .replace(/[<>]/g, ' ')
    // Normalize symbols for natural spoken speech
    .replace(/\+/g, ' plus ')
    .replace(/\//g, ' or ')
    // Remove emojis or symbols that confuse TTS reading
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    // Normalize punctuation & whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/** Get the currently selected voice setting */
export async function getVoiceSetting(dataFile = SETTINGS_FILE) {
  try {
    if (fs.existsSync(dataFile)) {
      const raw = await fsPromises.readFile(dataFile, 'utf8');
      const data = JSON.parse(raw);
      if (data && data.voiceKey && AVAILABLE_VOICES[data.voiceKey]) {
        return {
          voiceKey: data.voiceKey,
          voiceId: AVAILABLE_VOICES[data.voiceKey].id,
          label: AVAILABLE_VOICES[data.voiceKey].label,
          availableVoices: AVAILABLE_VOICES,
        };
      }
    }
  } catch {}

  return {
    voiceKey: DEFAULT_VOICE_KEY,
    voiceId: AVAILABLE_VOICES[DEFAULT_VOICE_KEY].id,
    label: AVAILABLE_VOICES[DEFAULT_VOICE_KEY].label,
    availableVoices: AVAILABLE_VOICES,
  };
}

/** Set and persist the default voice setting */
export async function setVoiceSetting(voiceKey, dataFile = SETTINGS_FILE) {
  const normKey = (voiceKey || '').toLowerCase().trim();
  if (!AVAILABLE_VOICES[normKey]) {
    throw new Error(`Unknown voice key "${voiceKey}". Available: ${Object.keys(AVAILABLE_VOICES).join(', ')}`);
  }

  await fsPromises.mkdir(path.dirname(dataFile), { recursive: true }).catch(() => {});
  const data = {
    voiceKey: normKey,
    updatedAt: new Date().toISOString(),
  };
  await fsPromises.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
  return {
    voiceKey: normKey,
    voiceId: AVAILABLE_VOICES[normKey].id,
    label: AVAILABLE_VOICES[normKey].label,
  };
}

/** Resolve voice ID from key or raw voice string */
export function resolveVoiceId(voiceKeyOrId) {
  if (!voiceKeyOrId) return AVAILABLE_VOICES[DEFAULT_VOICE_KEY].id;
  const key = voiceKeyOrId.toLowerCase().trim();
  if (AVAILABLE_VOICES[key]) return AVAILABLE_VOICES[key].id;
  return voiceKeyOrId; // if passed exact voice name e.g. en-GB-ThomasNeural
}

/** Synthesize speech directly to MP3 file */
export async function synthesizeToMp3(text, voiceKeyOrId, { maxRetries = 3 } = {}) {
  const speechText = cleanTextForSpeech(text);
  if (!speechText) throw new Error('Cannot synthesize empty text');

  const voiceId = resolveVoiceId(voiceKeyOrId);
  await fsPromises.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});

  const hash = crypto.createHash('md5').update(`${voiceId}:${speechText}`).digest('hex');
  const tempDir = path.join(CACHE_DIR, `tts_${hash}`);
  const finalMp3 = path.join(CACHE_DIR, `tts_${hash}.mp3`);

  // Check cache
  if (fs.existsSync(finalMp3)) {
    return { filePath: finalMp3, fromCache: true };
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await fsPromises.mkdir(tempDir, { recursive: true });
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      await tts.toFile(tempDir, speechText);

      const rawAudio = path.join(tempDir, 'audio.mp3');
      if (!fs.existsSync(rawAudio)) {
        throw new Error('TTS produced no audio file');
      }
      await fsPromises.rename(rawAudio, finalMp3);
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});

      return { filePath: finalMp3, fromCache: false };
    } catch (err) {
      lastErr = err;
      await fsPromises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      if (attempt < maxRetries) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastErr || new Error('TTS synthesis failed');
}

/** Synthesize speech to Telegram native OGG Opus voice note */
export async function synthesizeToOggOpus(text, voiceKeyOrId, { execFileImpl = execFileAsync } = {}) {
  const { filePath: mp3Path } = await synthesizeToMp3(text, voiceKeyOrId);
  const oggPath = mp3Path.replace(/\.mp3$/, '.ogg');

  if (fs.existsSync(oggPath)) {
    return { filePath: oggPath, fromCache: true };
  }

  // Fast encode via ffmpeg: 32kbps Opus
  await execFileImpl('ffmpeg', ['-y', '-i', mp3Path, '-c:a', 'libopus', '-b:a', '32k', oggPath]);

  return { filePath: oggPath, fromCache: false };
}

/**
 * Creates a clean, conversational briefing script suitable for natural spoken speech.
 */
export function createSpokenBriefingText(apps = [], now = new Date()) {
  const weekday = now.toLocaleDateString('en-NZ', { weekday: 'long', timeZone: 'Pacific/Auckland' });
  const dayMonth = now.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', timeZone: 'Pacific/Auckland' });
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const in48hStr = `${in48h.getFullYear()}-${String(in48h.getMonth() + 1).padStart(2, '0')}-${String(in48h.getDate()).padStart(2, '0')}`;

  const activeApps = apps.filter((a) => a.status !== 'rejected' && a.status !== 'withdrawn' && a.status !== 'skipped');
  const urgentDeadlines = activeApps.filter((a) => a.deadline && a.deadline.slice(0, 10) <= in48hStr);
  const dueFollowUps = activeApps.filter((a) => a.followUpDue && a.followUpDue.slice(0, 10) <= todayStr);
  const interviews = activeApps.filter((a) => a.status === 'interview');

  const parts = [];
  parts.push(`Good morning, sir. Here is your JobSearchHQ briefing for ${weekday}, ${dayMonth}.`);

  if (urgentDeadlines.length > 0) {
    const d = urgentDeadlines[0];
    const isToday = d.deadline.slice(0, 10) <= todayStr;
    parts.push(`Priority alert: Application deadline for ${d.company} closes ${isToday ? 'today' : 'within 48 hours'}.`);
  }

  if (dueFollowUps.length > 0) {
    const f = dueFollowUps[0];
    parts.push(`A follow-up is due today with ${f.company} regarding your ${f.role} application.`);
  }

  if (interviews.length > 0) {
    parts.push(`You have active interview progression underway with ${interviews.map((i) => i.company).join(', ')}.`);
  }

  parts.push(`You currently have ${activeApps.length} active roles in your tracking pipeline.`);
  parts.push('All background monitoring and radar services are operating normally. Standing by for your instructions.');

  return parts.join(' ');
}
