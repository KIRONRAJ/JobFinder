// archetype-router.mjs — Dual-signal classifier router for job archetypes.
// Scores Job Title (Signal A) and Job Description (Signal B) independently
// across 4 candidate archetypes. When signals agree, it tags the role cleanly.
// When signals conflict, it flags the disagreement for human confirmation.
// Token & API cost: $0.00 (deterministic local scoring).

export const ARCHETYPES = {
  FULLSTACK_SOFTWARE: 'fullstack_software',
  CLOUD_DEVOPS_SYSTEMS: 'cloud_devops_systems',
  NETWORK_SECURITY_OPS: 'network_security_ops',
  IT_SUPPORT_SERVICES: 'it_support_services',
};

export const ARCHETYPE_LABELS = {
  fullstack_software: 'Full-Stack & Web Software Engineering',
  cloud_devops_systems: 'Cloud Infrastructure & Linux Systems',
  network_security_ops: 'Network & Security Operations (NOC/SOC)',
  it_support_services: 'Technical Support & IT Services',
};

const TITLE_KEYWORDS = {
  [ARCHETYPES.FULLSTACK_SOFTWARE]: [
    'software engineer', 'software developer', 'full stack', 'full-stack', 'fullstack',
    'frontend', 'front-end', 'backend', 'back-end', 'web developer', 'javascript developer',
    'react developer', 'python developer', 'node developer', 'application developer'
  ],
  [ARCHETYPES.CLOUD_DEVOPS_SYSTEMS]: [
    'devops', 'cloud engineer', 'cloud architect', 'platform engineer', 'site reliability',
    'sre', 'linux administrator', 'systems administrator', 'system administrator',
    'sysadmin', 'infrastructure engineer', 'hosting engineer'
  ],
  [ARCHETYPES.NETWORK_SECURITY_OPS]: [
    'noc engineer', 'soc analyst', 'network engineer', 'network technician', 'cyber security',
    'cybersecurity', 'security analyst', 'security engineer', 'information security',
    'infosec', 'telecom engineer', 'isp technician', 'security consultant'
  ],
  [ARCHETYPES.IT_SUPPORT_SERVICES]: [
    'it support', 'helpdesk', 'help desk', 'service desk', 'desktop support',
    'technical support', 'customer support specialist', 'it specialist', 'it technician',
    'field technician', 'operations support', 'it coordinator'
  ],
};

const CONTENT_KEYWORDS = {
  [ARCHETYPES.FULLSTACK_SOFTWARE]: [
    'javascript', 'typescript', 'react', 'next.js', 'vue', 'angular', 'node', 'nodejs',
    'python', 'django', 'fastapi', 'rest api', 'graphql', 'html5', 'css3', 'tailwind',
    'git', 'github', 'unit testing', 'frontend', 'backend', 'full-stack', 'web development',
    'postgresql', 'sql', 'mongodb', 'docker'
  ],
  [ARCHETYPES.CLOUD_DEVOPS_SYSTEMS]: [
    'linux', 'rhel', 'centos', 'ubuntu', 'bash', 'shell script', 'aws', 'azure', 'gcp',
    'cloud', 'docker', 'container', 'kubernetes', 'k8s', 'terraform', 'ansible', 'ci/cd',
    'pipeline', 'jenkins', 'gitlab ci', 'dns', 'vps', 'server hardening', 'web hosting',
    'nginx', 'apache', 'monitoring', 'prometheus', 'grafana'
  ],
  [ARCHETYPES.NETWORK_SECURITY_OPS]: [
    'network', 'routing', 'switching', 'cisco', 'ccna', 'ospf', 'bgp', 'vlan', 'subnet',
    'firewall', 'vpn', 'noc', 'soc', 'siem', 'ids', 'ips', 'incident response',
    'vulnerability', 'wireshark', 'penetration testing', 'replay attack', 'iot security',
    'telecommunications', 'isp', 'upstream carrier', 'packet analysis'
  ],
  [ARCHETYPES.IT_SUPPORT_SERVICES]: [
    'helpdesk', 'service desk', 'troubleshooting', 'ticketing', 'jira', 'zendesk', 'sla',
    'customer service', 'end user', 'desktop support', 'hardware', 'laptop', 'peripheral',
    'printer', 'active directory', 'office 365', 'microsoft 365', 'remote support',
    'anydesk', 'teamviewer', 'on-site', 'it support', 'asset management'
  ],
};

function scoreTokens(text, keywords) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    // Exact word phrase match
    const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) {
      score += matches.length * (kw.includes(' ') ? 2 : 1);
    }
  }
  return score;
}

export function scoreJobTitle(title = '') {
  const scores = {};
  for (const [archetype, kws] of Object.entries(TITLE_KEYWORDS)) {
    scores[archetype] = scoreTokens(title, kws);
  }
  return scores;
}

export function scoreJobContent(jdText = '') {
  const scores = {};
  for (const [archetype, kws] of Object.entries(CONTENT_KEYWORDS)) {
    scores[archetype] = scoreTokens(jdText, kws);
  }
  return scores;
}

function getTopScore(scores) {
  let bestKey = null;
  let bestVal = -1;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
  }
  return { key: bestVal > 0 ? bestKey : null, score: bestVal };
}

/**
 * Evaluates Job Title (Signal A) and Job Description (Signal B).
 * Returns:
 * {
 *   archetype: string | null,
 *   confidence: 'high' | 'medium' | 'conflict' | 'unknown',
 *   conflict: boolean,
 *   signalA: { archetype: string|null, score: number },
 *   signalB: { archetype: string|null, score: number },
 *   reason: string,
 *   label: string
 * }
 */
export function routeJobArchetype({ title = '', jdText = '' } = {}) {
  const titleScores = scoreJobTitle(title);
  const contentScores = scoreJobContent(jdText);

  const topTitle = getTopScore(titleScores);
  const topContent = getTopScore(contentScores);

  // Case 1: Both signals match cleanly
  if (topTitle.key && topContent.key && topTitle.key === topContent.key) {
    return {
      archetype: topTitle.key,
      confidence: 'high',
      conflict: false,
      signalA: topTitle,
      signalB: topContent,
      reason: `Title and job description both strongly align with ${ARCHETYPE_LABELS[topTitle.key]}.`,
      label: ARCHETYPE_LABELS[topTitle.key],
    };
  }

  // Case 2: One signal has strong match, other is blank/neutral
  if (topTitle.key && !topContent.key) {
    return {
      archetype: topTitle.key,
      confidence: 'medium',
      conflict: false,
      signalA: topTitle,
      signalB: topContent,
      reason: `Matched via job title alone: ${ARCHETYPE_LABELS[topTitle.key]}.`,
      label: ARCHETYPE_LABELS[topTitle.key],
    };
  }

  if (!topTitle.key && topContent.key) {
    return {
      archetype: topContent.key,
      confidence: 'medium',
      conflict: false,
      signalA: topTitle,
      signalB: topContent,
      reason: `Matched via job description responsibilities: ${ARCHETYPE_LABELS[topContent.key]}.`,
      label: ARCHETYPE_LABELS[topContent.key],
    };
  }

  // Case 3: Both signals produced matches, but they disagree
  if (topTitle.key && topContent.key && topTitle.key !== topContent.key) {
    return {
      archetype: null,
      confidence: 'conflict',
      conflict: true,
      signalA: topTitle,
      signalB: topContent,
      suggested: [topTitle.key, topContent.key],
      reason: `Title suggests "${ARCHETYPE_LABELS[topTitle.key]}" but responsibilities emphasize "${ARCHETYPE_LABELS[topContent.key]}". Needs human selection.`,
      label: 'Needs Selection (Conflict)',
    };
  }

  // Case 4: Inconclusive
  return {
    archetype: null,
    confidence: 'unknown',
    conflict: false,
    signalA: topTitle,
    signalB: topContent,
    reason: 'Could not confidently determine archetype from title or description.',
    label: 'Unassigned',
  };
}
