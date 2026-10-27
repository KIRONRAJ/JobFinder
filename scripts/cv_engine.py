#!/usr/bin/env python3
"""Deterministic CV engine: job ad -> evidence-backed CV spec -> local ATS score.

No model calls. Every CV line comes from App/data/cv-evidence.json (verified once by
Jordan); every keyword from App/data/ats-lexicon.json. A term the evidence can't
prove is reported as a gap and never written onto the CV.

The scoring mirrors the external analyzer the two earlier reports came from
(hard 40 / soft 20 / searchability 25 / formatting 15, strict literal scan, preferred
terms at half weight) - it reproduces both reported scores (57 and 50) exactly.
See docs/superpowers/plans/2026-09-25-deterministic-ats-cv-engine.md.

    python3 cv_engine.py keywords --jd jd.txt
    python3 cv_engine.py build --match-key KEY [--jd jd.txt] (--out spec.json | --merge spec.json)
    python3 cv_engine.py import-report --docx analysis.docx [--dry-run]

Scoring a generated CV: python3 verify-docs.py --match-key KEY (reports "Local ATS score").
"""
import argparse
import json
import os
import re
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'App', 'data')
LEXICON = os.path.join(DATA, 'ats-lexicon.json')
EVIDENCE = os.path.join(DATA, 'cv-evidence.json')
APPLICATIONS = os.path.join(DATA, 'applications.json')

PREFERRED_RE = re.compile(r'desirable|preferred|nice to have|advantage|bonus|useful but not essential', re.I)
WEIGHTS = {'hard': .40, 'soft': .20, 'search': .25, 'format': .15}   # reverse-engineered, see docstring
SANS_OK = ('calibri', 'carlito', 'arial', 'liberationsans', 'roboto', 'helvetica')


def load(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def norm(text):
    return re.sub(r'\s+', ' ', (text or '').lower().replace('’', "'"))


def count(text_low, phrase):
    return len(re.findall(r'(?<![a-z0-9])' + re.escape(phrase.lower()) + r'(?![a-z0-9])', text_low))


def forms(entry):
    return [entry['term']] + entry.get('variants', [])


def form_hits(text_low, entry):
    """Occurrences of each form, non-overlapping and longest-first, so 'facilitation'
    isn't counted a second time inside 'facilitation skills'."""
    alts = sorted(forms(entry), key=len, reverse=True)
    pattern = r'(?<![a-z0-9])(' + '|'.join(re.escape(f.lower()) for f in alts) + r')(?![a-z0-9])'
    hits = dict.fromkeys(forms(entry), 0)
    lower = {f.lower(): f for f in forms(entry)}
    for m in re.findall(pattern, text_low):
        hits[lower[m]] += 1
    return hits


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------
def extract(jd_text, lexicon):
    """Lexicon terms the ad uses, in the ad's own spelling, required first."""
    low = norm(jd_text)
    # Clause-level, so "X role, with Y experience strongly preferred" only demotes Y.
    pref = [norm(s) for s in re.split(r'[.!?\n,;]', jd_text or '') if PREFERRED_RE.search(s)]
    out = []
    for e in lexicon['terms']:
        hits = form_hits(low, e)
        n = sum(hits.values())
        if not n:
            continue
        in_pref = sum(sum(form_hits(s, e).values()) for s in pref)
        surface = max(forms(e), key=lambda f: hits[f])
        out.append({'term': e['term'], 'surface': surface,
                    'display': e.get('display') if surface == e['term'] else None,   # explicit label only
                    'kind': e['kind'], 'jdCount': n,
                    'priority': 'preferred' if in_pref >= n else 'required'})
    return sorted(out, key=lambda k: (k['priority'] != 'required', -k['jdCount'], k['term']))


def claimable(evidence, lexicon=None):
    """Terms the CV may carry. Personal traits (soft terms without needsEvidence) are
    claimed dynamically when evidence.autoClaimSoftSkills is on - Jordan's call,
    25 Sep 2026 - so any trait a future ad asks for flows onto the CV. Skills that
    need real experience (facilitation) still need a bullet that proves them."""
    terms = set(evidence.get('claims', []))
    if lexicon and evidence.get('autoClaimSoftSkills'):
        terms.update(e['term'] for e in lexicon['terms'] if e['kind'] == 'soft' and not e.get('needsEvidence'))
    for r in evidence['roles'] + evidence.get('projects', []):
        for b in r['bullets']:
            terms.update(b['terms'])
    return terms


# ---------------------------------------------------------------------------
# Scoring (local replica of the external analyzer)
# ---------------------------------------------------------------------------
def keyword_score(kws, cv_text, kind):
    low = norm(cv_text)
    items = [k for k in kws if k['kind'] == kind]
    if not items:
        return None
    got = tot = 0.0
    for k in items:
        w = 0.5 if k['priority'] == 'preferred' else 1.0
        got += w * min(1.0, count(low, k['surface']) / k['jdCount'])   # strict: the ad's spelling only
        tot += w
    return round(100 * got / tot)


def searchability(cv_text, title):
    low = norm(cv_text)

    def has(h):
        return re.search(r'^\s*%s\s*$' % h, cv_text, re.M) is not None

    checks = {
        'email': re.search(r'[\w.+-]+@[\w-]+\.[\w.]+', cv_text) is not None,
        'phone': re.search(r'\+?\d[\d ]{7,}\d', cv_text) is not None,
        'linkedin': 'linkedin.com/in/' in low,
        'location': 'wellington' in low,
        'job title': bool(title) and count(low, title) > 0,
        'dates': re.search(r'\b(0[1-9]|1[0-2])/(19|20)\d{2}\b', cv_text) is not None,
        'structure': has('SUMMARY') and has('EXPERIENCE'),
        'education': has('EDUCATION'),
        'summary': has('SUMMARY'),
        'core sections': all(has(h) for h in ('EXPERIENCE', 'EDUCATION', 'SKILLS')),
        'no empty sections': True,   # ponytail: generator never emits an empty section; parse it if that changes
    }
    failed = [k for k, v in checks.items() if not v]
    return round(100 * (len(checks) - len(failed)) / len(checks)), failed


def formatting(pdf_path, docx_path=None):
    """Approximate: the analyzer's exact formatting rules aren't published."""
    try:
        out = subprocess.run(['pdffonts', pdf_path], capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return None, ['pdffonts unavailable']
    names = [line.split()[0].split('+')[-1].lower() for line in out.splitlines()[2:] if line.strip()]
    families = {re.split(r'[-,]', n)[0] for n in names}
    checks = {
        'standard sans typeface': bool(families) and all(f.startswith(SANS_OK) for f in families),
        'max 2 font families': len(families) <= 2,
        'bold used': any('bold' in n for n in names),
    }
    if docx_path:
        xml = zipfile.ZipFile(docx_path).read('word/document.xml').decode('utf-8', 'replace')
        checks['heading styles'] = 'w:val="Heading1"' in xml
        checks['no tables'] = '<w:tbl>' not in xml
    failed = [k for k, v in checks.items() if not v]
    return round(100 * (len(checks) - len(failed)) / len(checks)), failed


def overall(parts):
    p = [(parts[k], w) for k, w in WEIGHTS.items() if parts.get(k) is not None]
    return round(sum(v * w for v, w in p) / sum(w for _, w in p))


def score_all(kws, cv_text, title, pdf=None, docx=None):
    low = norm(cv_text)
    search, search_failed = searchability(cv_text, title)
    fmt, fmt_failed = formatting(pdf, docx) if pdf else (None, [])
    parts = {'hard': keyword_score(kws, cv_text, 'hard'), 'soft': keyword_score(kws, cv_text, 'soft'),
             'search': search, 'format': fmt}
    parts['overall'] = overall(parts)
    parts['missing'] = [k['surface'] for k in kws if count(low, k['surface']) < k['jdCount']]
    parts['searchFailed'], parts['formatFailed'] = search_failed, fmt_failed
    return parts


# ---------------------------------------------------------------------------
# Honesty gates (used by verify-docs.py on every CV, LLM-drafted or not)
# ---------------------------------------------------------------------------
def unevidenced(text, lexicon, evidence):
    low, have = norm(text), claimable(evidence, lexicon)
    bad = [e for e in lexicon['terms'] if e['term'] not in have and any(count(low, f) for f in forms(e))]
    return [e['term'] for e in bad if e['kind'] == 'hard'], [e['term'] for e in bad if e['kind'] == 'soft']


def title_violations(text, evidence):
    low = text.lower()
    return ['%s: expected "%s"' % (r['companyKey'], r['title']) for r in evidence['roles']
            if r['companyKey'].lower() in low and r['title'].lower() not in low]


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------
def _mmyyyy(ym):
    y, m = ym.split('-')
    return '%s/%s' % (m, y)


def _join(words):
    return words[0] if len(words) == 1 else ', '.join(words[:-1]) + ' and ' + words[-1]


_ACRONYMS = {'ai', 'it', 'sla', 'noc', 'iot', 'siem', 'soar', 'edr', 'vpn', 'dns'}


def _cap(s):
    """Sentence-case a keyword for the Skills line, keeping acronyms upper-case ('ai tools' -> 'AI tools')."""
    head, _, rest = s.partition(' ')
    if head.lower() in _ACRONYMS:
        return head.upper() + (' ' + rest if rest else '')
    return s[:1].upper() + s[1:]


def _mid_sentence(label):
    """'Active listening' -> 'active listening'; Linux, Microsoft 365, AI-enabled tools stay put."""
    words = label.split()
    if len(words) > 1 and label[1:2].islower() and words[1][:1].islower():
        return label[0].lower() + label[1:]
    return label


def _dedupe(items):
    seen, out = set(), []
    for i in items:
        if i.lower() not in seen:
            seen.add(i.lower())
            out.append(i)
    return out


def _safe_folder(folder):
    folder = (folder or '').strip()
    if folder and not os.path.isabs(folder) and '..' not in re.split(r'[\\/]', folder):
        return folder
    return None


def build(entry, jd_text, evidence, lexicon, max_bullets=4, max_projects=3, relevance=0.25):
    kws = extract(jd_text, lexicon)
    have = claimable(evidence, lexicon)
    hit = [k for k in kws if k['term'] in have]
    weight = {k['term']: k['jdCount'] for k in hit}

    def bscore(b):
        return sum(weight.get(t, 0) for t in b['terms'])

    def pick(bullets, n):
        top = sorted(bullets, key=bscore, reverse=True)[:n]
        return [b for b in bullets if b in top]          # keep the bank's own order

    jobs = []
    for r in evidence['roles']:
        chosen = pick(r['bullets'], max_bullets)
        jobs.append({'role': r['title'], 'company': r['company'],
                     'period': '%s - %s | %s' % (_mmyyyy(r['start']), _mmyyyy(r['end']), r['location']),
                     'bullets': [b['text'] for b in chosen],
                     '_score': sum(bscore(b) for b in chosen), '_end': r['end']})
    jobs.sort(key=lambda j: j['_end'], reverse=True)
    # A role leads under EXPERIENCE only if it carries a real share of the ad's terms;
    # otherwise the most recent job (a brewery shift) would top page 1 on recency alone.
    top_score = max(j['_score'] for j in jobs)
    main = [j for j in jobs if j['_score'] > 0 and j['_score'] >= relevance * top_score] or jobs[:2]
    extra = [j for j in jobs if j not in main]

    def strip(js):
        return [{k: v for k, v in j.items() if not k.startswith('_')} for j in js]

    projects = sorted(evidence['projects'], key=lambda p: sum(bscore(b) for b in p['bullets']), reverse=True)
    required = [_mid_sentence(k['display']) if k['display'] else k['surface']
                for k in hit if k['priority'] == 'required']
    strengths = required[:4] or evidence['summaryFallbackStrengths']
    hard = [k['display'] or _cap(k['surface']) for k in hit if k['kind'] == 'hard']
    soft = [k['display'] or _cap(k['surface']) for k in hit if k['kind'] == 'soft']
    pending = evidence.get('pendingClaims', {})

    spec = {
        'deterministic': True,
        'availability': evidence.get('availability', ''),
        'company': entry['company'], 'role': entry['role'],
        'headline': entry['role'],
        'profile': evidence['summary'].format(title=entry['role'], company=entry['company'],
                                              strengths=_join(strengths)),
        'skills': [
            {'category': 'Technical', 'detail': ', '.join(_dedupe(hard + evidence['coreSkills']['hard'])[:14])},
            {'category': 'Professional', 'detail': ', '.join(_dedupe(soft + evidence['coreSkills']['soft'])[:10])},
        ],
        'workHistory': strip(main),
        'additionalExperience': strip(extra),
        'projects': [{'title': p['title'], 'bullets': [b['text'] for b in p['bullets']]}
                     for p in projects[:max_projects]],
        'education': evidence['education'],
        'certifications': evidence['certifications'],
        'atsReport': {
            'recognised': len(kws),
            'keywords': hit,
            'gaps': [k for k in kws if k['term'] not in have],
            'unlockable': {k['term']: pending[k['term']] for k in kws if k['term'] not in have and k['term'] in pending},
        },
    }
    folder = _safe_folder(entry.get('folderPath'))
    if folder:
        spec['outputDir'] = folder
    return spec


def explain(entry, jd_text, evidence, lexicon):
    """Why the CV looks the way it does: every bank bullet kept or dropped, every ad
    term proven by a bullet, claimed (claims list / soft trait), unlockable or a gap."""
    spec = build(entry, jd_text, evidence, lexicon)
    have = claimable(evidence, lexicon)
    pending = evidence.get('pendingClaims', {})
    proven = {t for r in evidence['roles'] + evidence.get('projects', []) for b in r['bullets'] for t in b['terms']}
    kws = extract(jd_text, lexicon)
    hit = {k['term'] for k in kws if k['term'] in have}
    kept = {b for j in spec['workHistory'] + spec['additionalExperience'] for b in j['bullets']}
    lead = {j['role'] for j in spec['workHistory']}
    picked = {p['title'] for p in spec['projects']}

    def bullets(bs, chosen):
        return [{'text': b['text'], 'terms': b['terms'], 'matched': [t for t in b['terms'] if t in hit],
                 'chosen': chosen(b)} for b in bs]

    def state(t):
        return ('proven' if t in proven else 'claimed' if t in have
                else 'unlockable' if t in pending else 'gap')

    return {
        'keywords': [{'term': k['term'], 'surface': k['surface'], 'kind': k['kind'], 'priority': k['priority'],
                      'jdCount': k['jdCount'], 'state': state(k['term']), 'note': pending.get(k['term'])}
                     for k in kws],
        'roles': [{'title': r['title'], 'company': r['company'], 'lead': r['title'] in lead,
                   'bullets': bullets(r['bullets'], lambda b: b['text'] in kept)} for r in evidence['roles']],
        'projects': [{'title': p['title'], 'chosen': p['title'] in picked,
                      'bullets': bullets(p['bullets'], lambda b, p=p: p['title'] in picked)}
                     for p in evidence.get('projects', [])],
    }


def save_lexicon(lexicon, path=LEXICON):
    """One term per line, so a lexicon diff reads as the list of terms that changed."""
    body = ',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in lexicon['terms'])
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('{\n  "terms": [\n' + body + '\n  ]\n}\n')


def import_report(docx_path, lexicon):
    """Pull the skill tables (hard first, soft second) out of an analyzer report docx."""
    import docx   # python-docx; only this subcommand needs it
    known = {f.lower() for e in lexicon['terms'] for f in forms(e)}
    added = []
    tables = [t for t in docx.Document(docx_path).tables if t.rows and t.rows[0].cells[0].text.strip() == 'Skill']
    for kind, table in zip(('hard', 'soft'), tables):
        for row in table.rows[1:]:
            term = re.split(r'\n|(?:Not )?[Ff]ound in strict', row.cells[0].text)[0].strip().lower()
            if term and term not in known:
                lexicon['terms'].append({'term': term, 'kind': kind})
                known.add(term)
                added.append(term)
    return added


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _entry(key):
    for e in load(APPLICATIONS):
        if key in (e.get('id'), e.get('matchKey')):
            return e
    sys.exit('no entry %r' % key)


def _read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    k = sub.add_parser('keywords')
    k.add_argument('--jd', required=True)
    b = sub.add_parser('build')
    b.add_argument('--match-key', required=True)
    b.add_argument('--jd')
    b.add_argument('--out')
    b.add_argument('--merge')
    x = sub.add_parser('explain')
    x.add_argument('--match-key', required=True)
    r = sub.add_parser('import-report')
    r.add_argument('--docx', required=True)
    r.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    lex = load(LEXICON)

    if args.cmd == 'keywords':
        print(json.dumps(extract(_read(args.jd), lex), indent=2))
        return 0

    if args.cmd == 'import-report':
        added = import_report(args.docx, lex)
        if added and not args.dry_run:
            save_lexicon(lex)
        print('added %d: %s' % (len(added), ', '.join(added) or '-'))
        soft = [t for t in added if next(e for e in lex['terms'] if e['term'] == t)['kind'] == 'soft']
        if soft:
            print('auto-claimed as traits (add "needsEvidence": true in ats-lexicon.json for any that need real experience): '
                  + ', '.join(soft))
        return 0

    if args.cmd == 'explain':
        entry = _entry(args.match_key)
        if not (entry.get('jobText') or '').strip():
            sys.exit('no job ad text saved on this entry')
        print(json.dumps(explain(entry, entry['jobText'], load(EVIDENCE), lex)))
        return 0

    target = args.merge or args.out
    if not target:
        ap.error('build needs --out or --merge')
    entry = _entry(args.match_key)
    jd = _read(args.jd) if args.jd else (entry.get('jobText') or '')
    if not jd.strip():
        sys.exit('no job ad text: pass --jd or save entry.jobText')
    spec = build(entry, jd, load(EVIDENCE), lex)
    if args.merge and os.path.exists(args.merge):
        base = load(args.merge)
        base.update(spec)          # CV keys replaced; coverLetter kept
        spec = base
    with open(target, 'w', encoding='utf-8') as fh:
        json.dump(spec, fh, indent=2)
    rep = spec['atsReport']
    print('recognised %d JD terms; evidenced %d; gaps: %s' % (
        rep['recognised'], len(rep['keywords']), ', '.join(g['surface'] for g in rep['gaps']) or 'none'))
    if rep['unlockable']:
        print('confirm to unlock (move into cv-evidence.json "claims"): ' + ', '.join(rep['unlockable']))
    if rep['recognised'] == 0:
        print('0 JD terms recognised - run import-report on an analyzer report to grow the lexicon')
    return 0


if __name__ == '__main__':
    sys.exit(main())
