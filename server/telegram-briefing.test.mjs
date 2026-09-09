import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBriefing } from './telegram-briefing.js';

test('formatBriefing: formats morning briefing with active deadlines and follow-ups', () => {
  const now = new Date('2026-09-04T08:30:00+12:00');
  const apps = [
    {
      status: 'interview',
      company: 'Spark',
      role: 'Call Investigator',
    },
    {
      status: 'applied',
      company: 'Bastion Security',
      role: 'SOC Analyst',
      deadline: '2026-09-04',
      followUpDue: '2026-09-04',
      tasks: [{ label: 'Send references', dueAt: '2026-09-04T10:00:00+12:00' }],
    },
    {
      status: 'rejected',
      company: 'Old Corp',
      role: 'Inactive',
    },
  ];

  const msg = formatBriefing(apps, now);
  assert.ok(msg.includes('Good morning'));
  assert.ok(msg.includes('Bastion Security'));
  assert.ok(msg.includes('CLOSES TODAY'));
  assert.ok(msg.includes('Spark'));
  assert.ok(msg.includes('Send references'));
  assert.ok(!msg.includes('Old Corp'));
});

test('formatBriefing: clean pipeline produces calm message', () => {
  const now = new Date('2026-09-04T08:30:00+12:00');
  const apps = [
    {
      status: 'applied',
      company: 'Acme',
      role: 'Developer',
    },
  ];

  const msg = formatBriefing(apps, now);
  assert.ok(msg.includes('Good morning'));
  assert.ok(msg.includes('No urgent deadlines or follow-ups due today. Pipeline is calm.'));
  assert.ok(msg.includes('1 applied'));
});
