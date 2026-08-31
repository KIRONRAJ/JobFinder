import type { UpskillReport } from '../types';

/**
 * Keyword each guide's topic is known by across job ads and upskill-report's
 * own wording — not the SKILL_ALIASES map in `lib/market.ts` (that canonicalises
 * ad-extracted keywords one at a time; this only needs to recognise a guide's
 * own subject in a short recurring-gap sentence, a simpler, looser match).
 */
const GUIDE_KEYWORDS: Record<string, string[]> = {
  '01-SIEM.md': ['siem', 'splunk', 'sentinel', 'wazuh', 'elk stack', 'qradar'],
  '02-Vulnerability-Scanning.md': ['vulnerability scan', 'vuln scan', 'nessus', 'cvss', 'openvas'],
  '03-Active-Directory-Entra-ID.md': [
    'active directory',
    'entra id',
    'azure ad',
    'azure active directory',
    'ad/entra',
  ],
  '04-EDR.md': ['edr', 'endpoint detection'],
  '05-Pentesting-Basics.md': ['pentest', 'penetration test'],
  '06-Incident-Response.md': ['incident response'],
  '07-Encryption-PKI.md': ['encryption', ' pki', 'pki)', 'tls', 'certificate authority'],
};

export interface GapLinkage {
  skill: string;
  roleCount: number;
  roles: string[];
}

/**
 * The Study view's actual payoff: does this guide close a gap that's known
 * to have cost real applications, per Claude's own `upskill-report.json`
 * (regenerated during `/eod`)? Returns the single best-matching recurring
 * gap, or null when there's no report yet or nothing matches — a guide with
 * no linkage still renders, just without the "cost you N roles" line.
 */
export function gapLinkageFor(file: string, upskillReport: UpskillReport | null): GapLinkage | null {
  const keywords = GUIDE_KEYWORDS[file];
  if (!keywords || !upskillReport) return null;

  let best: GapLinkage | null = null;
  for (const gap of upskillReport.recurringGaps) {
    const skillLower = gap.skill.toLowerCase();
    if (!keywords.some((k) => skillLower.includes(k))) continue;
    if (!best || gap.count > best.roleCount) {
      best = { skill: gap.skill, roleCount: gap.count, roles: gap.roles };
    }
  }
  return best;
}
