import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routeJobArchetype,
  scoreJobTitle,
  scoreJobContent,
  ARCHETYPES,
} from './archetype-router.mjs';

test('archetype-router: matching signals produce clean high-confidence route', () => {
  const result = routeJobArchetype({
    title: 'L2 NOC Engineer',
    jdText: 'Looking for a network operations engineer with Cisco CCNA, routing, switching, ISP ticketing and upstream carrier troubleshooting.',
  });

  assert.equal(result.conflict, false);
  assert.equal(result.confidence, 'high');
  assert.equal(result.archetype, ARCHETYPES.NETWORK_SECURITY_OPS);
  assert.match(result.reason, /align with Network & Security Operations/);
});

test('archetype-router: conflicting signals flag human choice required', () => {
  const result = routeJobArchetype({
    title: 'Cloud DevOps Platform Engineer',
    jdText: 'Provide Tier 1 desktop support, reset passwords, fix office printers, configure laptops, and log service desk tickets in Zendesk.',
  });

  assert.equal(result.conflict, true);
  assert.equal(result.confidence, 'conflict');
  assert.equal(result.archetype, null);
  assert.ok(Array.isArray(result.suggested));
  assert.ok(result.suggested.includes(ARCHETYPES.CLOUD_DEVOPS_SYSTEMS));
  assert.ok(result.suggested.includes(ARCHETYPES.IT_SUPPORT_SERVICES));
  assert.match(result.reason, /Needs human selection/);
});

test('archetype-router: title-only produces medium confidence without conflict', () => {
  const result = routeJobArchetype({
    title: 'Senior Full Stack React Developer',
    jdText: '',
  });

  assert.equal(result.conflict, false);
  assert.equal(result.confidence, 'medium');
  assert.equal(result.archetype, ARCHETYPES.FULLSTACK_SOFTWARE);
});

test('archetype-router: content-only produces medium confidence without conflict', () => {
  const result = routeJobArchetype({
    title: 'Consultant',
    jdText: 'You will manage Linux RHEL servers, write Bash scripts, configure Docker containers, setup Nginx and automate AWS deployments.',
  });

  assert.equal(result.conflict, false);
  assert.equal(result.confidence, 'medium');
  assert.equal(result.archetype, ARCHETYPES.CLOUD_DEVOPS_SYSTEMS);
});

test('archetype-router: inconclusive case returns unknown', () => {
  const result = routeJobArchetype({
    title: 'Manager',
    jdText: 'Attend executive meetings and organize office social events.',
  });

  assert.equal(result.conflict, false);
  assert.equal(result.confidence, 'unknown');
  assert.equal(result.archetype, null);
});
