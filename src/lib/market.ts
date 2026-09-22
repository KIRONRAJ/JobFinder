import type { Application } from '../types';

/**
 * Common keyword variants that mean the same thing across job ads. Canonical
 * form is the value; every alias (case-insensitive, whitespace-normalised) maps
 * to it. Keep this small and specific — a fuzzy stemmer would over-merge
 * ("Azure" vs "Azure DevOps"), and the point of the market view is to see
 * which distinct skills recur, not to bucket everything into ten mega-groups.
 */
const SKILL_ALIASES: Record<string, string[]> = {
  'Microsoft 365': ['m365', 'office 365', 'o365', 'microsoft 365', 'ms 365'],
  'Entra ID': ['entra', 'entra id', 'azure ad', 'azure active directory', 'aad'],
  Azure: ['azure', 'microsoft azure'],
  AWS: ['aws', 'amazon web services'],
  'Active Directory': ['active directory', 'ad ds', 'windows ad'],
  ServiceNow: ['servicenow', 'service-now'],
  'ITIL / ITSM': ['itil', 'itsm', 'itil v4', 'it service management'],
  Linux: ['linux', 'linux administration', 'unix/linux'],
  'Windows Server': ['windows server', 'windows administration'],
  Networking: ['networking', 'tcp/ip', 'tcp-ip', 'network fundamentals', 'lan/wan'],
  SIEM: ['siem', 'security information and event management', 'splunk', 'sentinel', 'qradar'],
  'SOC operations': ['soc', 'security operations centre', 'security operations center'],
  Python: ['python', 'python scripting'],
  PowerShell: ['powershell', 'ps scripting'],
  Docker: ['docker', 'containers'],
  Kubernetes: ['kubernetes', 'k8s'],
  'CI/CD': ['ci/cd', 'ci-cd', 'continuous integration'],
  'Incident response': ['incident response', 'ir', 'incident management'],
  'Firewall / edge': ['firewall', 'firewalls', 'fortinet', 'palo alto', 'edge security'],
  'Endpoint management': ['intune', 'endpoint management', 'mdm', 'jamf'],
  'Ticketing / service desk': [
    'service desk',
    'help desk',
    'helpdesk',
    'ticketing',
    'ticket handling',
  ],
};

/** Case-insensitive, whitespace-trimmed lookup. Returns the canonical name if
 *  the raw keyword is a known alias; otherwise the raw keyword title-cased
 *  minimally (leave user text as-is otherwise). */
export function canonicalise(raw: string): string {
  const norm = raw.toLowerCase().replace(/["']/g, '').trim().replace(/\s+/g, ' ');
  for (const [canon, aliases] of Object.entries(SKILL_ALIASES)) {
    if (aliases.includes(norm)) return canon;
  }
  return raw.trim();
}

export type SkillStrength = 'strong' | 'developing' | 'gap';

export interface SkillStat {
  skill: string;
  matched: number;
  missing: number;
  toEvidence: number;
  /** Number of analysed roles that mentioned this skill in any bucket. */
  mentions: number;
  strength: SkillStrength;
}

/**
 * Walk every entry's stored analysis, canonicalise its ATS keywords, count
 * how often each canonical skill appears in each bucket, and classify each
 * skill's strength. Pure function — no side effects, no sorting yet.
 */
export function aggregateSkills(apps: Application[]): SkillStat[] {
  const stats = new Map<string, { matched: number; missing: number; toEvidence: number }>();

  const bump = (raw: string, bucket: 'matched' | 'missing' | 'toEvidence') => {
    const canon = canonicalise(raw);
    if (!canon) return;
    const cur = stats.get(canon) ?? { matched: 0, missing: 0, toEvidence: 0 };
    cur[bucket]++;
    stats.set(canon, cur);
  };

  for (const app of apps) {
    const ats = app.analysis?.ats;
    if (!ats) continue;
    for (const k of ats.matched ?? []) bump(k, 'matched');
    for (const k of ats.missing ?? []) bump(k, 'missing');
    for (const k of ats.toEvidence ?? []) bump(k, 'toEvidence');
  }

  const out: SkillStat[] = [];
  for (const [skill, c] of stats) {
    const mentions = c.matched + c.missing + c.toEvidence;
    const strength: SkillStrength =
      c.matched > c.missing + c.toEvidence
        ? 'strong'
        : c.matched > 0 || c.toEvidence > 0
          ? 'developing'
          : 'gap';
    out.push({ skill, ...c, mentions, strength });
  }
  return out;
}

/** Total number of roles that carry an analysis — the denominator for the
 *  "matched in N/M" text on each skill row. */
export function analysedCount(apps: Application[]): number {
  return apps.filter((a) => a.analysis).length;
}
