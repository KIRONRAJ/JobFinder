#!/usr/bin/env python3
"""Deterministic CV/cover-letter gate — the checks that never needed a model.

Everything the jobhq skill used to have Claude eyeball by hand after each
generation (page count, A4 page size, PII scrub, visa wording matching across
both documents, cover-letter word count, ATS keywords surviving into the PDF
text layer) is mechanical. Doing it here means one shell call instead of a
handful of AI turns, and the same verdict every time.

Usage:
    python verify-docs.py --match-key xero-customer-experience-specialist
    python verify-docs.py --folder "Pending to Apply/Xero"
    python verify-docs.py --match-key ... --json

Exit code 0 = pass, 1 = at least one FAIL. WARNs never fail the run.
Stdlib only (zipfile/re/subprocess) plus pdfinfo/pdftotext, both already on
this machine — no pip install, nothing to keep in sync.
"""

import argparse
import html
import json
import os
import re
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docnames  # noqa: E402  (filename rules, same folder)
import cv_engine  # noqa: E402  (same folder; stdlib-only apart from pdffonts)

ATS_TARGET = 80

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APPLICATIONS = os.path.join(ROOT, "App", "data", "applications.json")

# CV may run to two pages, the cover letter to one. Anything past that is a
# fail, not a stylistic choice (see the skill's page-budget section).
MAX_CV_PAGES = 2
A4_PTS = (595, 842)
CL_WORDS_HARD = (300, 400)
CL_WORDS_TARGET = (340, 360)

# Nothing here belongs on a NZ CV: it carries discrimination-screening risk,
# adds nothing an ATS scores on, and in the address case is a privacy leak.
PII_PATTERNS = [
    ("nationality", r"\bnationality\b"),
    ("date of birth", r"\b(date of birth|d\.?o\.?b\.?)\b"),
    ("marital status", r"\bmarital status\b"),
    ("gender", r"\bgender\s*[:\-]"),
    ("age", r"\bage\s*[:\-]\s*\d{1,2}\b"),
    (
        "street address",
        r"\b\d+[A-Za-z]?[/-]?\d*\s+[A-Z][a-z]+\s+"
        r"(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Place|Pl|Terrace|Cres|Crescent|Way|Grove|Parade)\b",
    ),
    ("referees section", r"^\s*referees?\s*$"),
]

VISA_RE = re.compile(
    r"(?:\d+[- ]year\s+)?(?:post[- ]study\s+work\s+visa|open\s+work\s+visa|work\s+visa)"
    r"(?:\s*\((?:open\s+work\s+visa|pswv)\))?",
    re.I,
)


def run(cmd):
    """Return stdout, or None if the tool is missing or exits non-zero."""
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout if out.returncode == 0 else None


def docx_text(path):
    """Paragraph text out of a .docx, without python-docx.

    A .docx is a zip of XML; `w:p` boundaries become newlines so word counts
    and line-anchored patterns (a bare "Referees" heading) behave.
    """
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<w:tab[^>]*/>", " ", xml)
    return html.unescape(re.sub(r"<[^>]+>", "", xml))


# The word target governs the letter, not the letterhead — counting the
# contact block and date with it overstates by ~35 words and would fail a
# letter that's actually in range.
GREETING_RE = re.compile(r"^\s*(kia ora|dear|t[eē]n[aā]\s*(?:koe|koutou)|hi\b)", re.I | re.M)


def letter_body(text):
    m = GREETING_RE.search(text)
    return text[m.start():] if m else text


# `analysis.ats.matched` is meant to hold the ad's own terms, but in practice it
# gets written as descriptive phrases ("customer service background", "database
# maintenance"). A literal substring test then reports 18 keywords missing from a
# CV that contains every one of them, and a warning that cries wolf is a warning
# nobody reads. Strip the descriptive scaffolding first, then test what's left.
QUALIFIER_WORDS = {
    'background', 'experience', 'experienced', 'proficiency', 'proficient',
    'skills', 'skill', 'knowledge', 'discipline', 'ability', 'strong', 'excellent',
    'maintenance', 'management', 'systems', 'system', 'work', 'working', 'mind',
    'set', 'the', 'a', 'an', 'of', 'and', 'or', 'in', 'to', 'for', 'with', 'on',
}


def keyword_variants(kw):
    """Progressively less strict forms of a keyword, longest first."""
    k = kw.lower().strip()
    yield k
    k = re.sub(r'\([^)]*\)', ' ', k)              # drop parenthetical qualifiers
    k = re.sub(r'\s+', ' ', k).strip(' ,.;:-')
    if k:
        yield k
    for part in re.split(r'\s*[/|,]\s*|\s+-\s+', k):   # "a / b" -> try each side
        part = part.strip()
        if not part:
            continue
        yield part
        words = [w for w in part.split() if w not in QUALIFIER_WORDS]
        if words and len(words) < len(part.split()):
            yield ' '.join(words)


def keyword_present(kw, text_low):
    for v in keyword_variants(kw):
        if len(v) >= 4 and v in text_low:
            return True
    return False


def is_literal_term(kw):
    """Is this a term worth testing for verbatim, or a descriptive phrase?

    This check exists to catch a formatting regression: a term written into the
    docx that `pdftotext` can't see because the run was split across a style
    boundary. That only makes sense for terms that should appear verbatim -
    "ServiceNow", "Microsoft Office", "ticketing". `matched` also collects
    capability statements like "supporting a team in an IT environment", which
    a well-written CV expresses in its own words ("supporting a technical
    team"). Testing those verbatim reports a miss on a CV that covers them
    perfectly well, so they're skipped and counted out loud rather than
    silently folded into the pass.

    The bar is two words or fewer, which is what product and tool names look
    like: ServiceNow, Cellebrite, Microsoft Office, Active Directory. Those are
    also exactly the terms the Learning Loop has repeatedly shown to be
    pass/fail on a real screen, so they're the ones worth a verbatim test.
    """
    return len(re.sub(r'\([^)]*\)', ' ', kw).split()) <= 2


def find_docs(folder, role=None):
    """Locate the CV/cover-letter pair in `folder`.

    A company folder can hold more than one role's documents at once (two
    roles logged at the same employer share `Pending to Apply/<Company>`
    by convention). When more than one candidate matches a category, prefer
    the one whose filename contains `role` (case-insensitive) rather than
    silently taking whichever sorts last.
    """
    cv_pdfs, cv_docxs, cl_docxs = [], [], []
    for name in sorted(os.listdir(folder)):
        low = name.lower()
        full = os.path.join(folder, name)
        if low.startswith("cv - ") and low.endswith(".pdf"):
            cv_pdfs.append(full)
        elif low.startswith("cv - ") and low.endswith(".docx"):
            cv_docxs.append(full)
        elif low.startswith("cover letter - ") and low.endswith(".docx"):
            cl_docxs.append(full)

    def pick(candidates):
        if len(candidates) <= 1:
            return candidates[0] if candidates else None
        if role:
            # Score by how many words of the role appear in the filename, so a
            # folder holding "Service Desk Analyst" and "Service Desk Analyst level 1
            # Support" still resolves to the right pair. Company-only names (no role
            # tag, set 14 Oct 2026) score 0 and fall through to the last candidate.
            words = [w for w in re.findall(r"[a-z0-9]+", role.lower())]
            def score(c):
                name = os.path.basename(c).lower()
                return sum(1 for w in words if w in re.findall(r"[a-z0-9]+", name))
            scored = sorted(((score(c), c) for c in candidates), reverse=True)
            if scored[0][0] > 0 and (len(scored) == 1 or scored[0][0] > scored[1][0]):
                return scored[0][1]
        return candidates[-1]

    return pick(cv_pdfs), pick(cv_docxs), pick(cl_docxs)


def entry_for(match_key):
    with open(APPLICATIONS, encoding="utf-8") as fh:
        for entry in json.load(fh):
            if entry.get("matchKey") == match_key or entry.get("id") == match_key:
                return entry
    return None


class Report(object):
    def __init__(self):
        self.checks = []

    def add(self, level, check, detail):
        self.checks.append({"level": level, "check": check, "detail": detail})

    ok = lambda self, c, d="": self.add("PASS", c, d)
    warn = lambda self, c, d="": self.add("WARN", c, d)
    fail = lambda self, c, d="": self.add("FAIL", c, d)

    @property
    def failed(self):
        return any(c["level"] == "FAIL" for c in self.checks)


def check_pii(rep, label, text):
    hits = []
    for name, pattern in PII_PATTERNS:
        if re.search(pattern, text, re.I | re.M):
            hits.append(name)
    if hits:
        rep.fail("%s PII scrub" % label, "found: " + ", ".join(hits))
    else:
        rep.ok("%s PII scrub" % label)


DANGLING_WORDS = r"(a|an|the)"
DANGLING_PUNCT_RE = re.compile(r"\b%s[ \t]*[.,](?:\s|$)" % DANGLING_WORDS, re.I)
DANGLING_EOP_RE = re.compile(r"\b%s\s*\n" % DANGLING_WORDS, re.I)


def check_dangling(rep, label, punct_text, eop_text=""):
    hits = set(m.group(1).lower() for m in DANGLING_PUNCT_RE.finditer(punct_text))
    hits |= set(m.group(1).lower() for m in DANGLING_EOP_RE.finditer(eop_text))
    if hits:
        rep.fail("%s unfinished sentence" % label, "dangling word before a break: " + ", ".join(sorted(hits)))
    else:
        rep.ok("%s unfinished sentence" % label)


FORBIDDEN_HOBBY_PATTERNS = [
    ("photography", r"\bphotograph(?:y|er)\b"),
    ("hiking/tramping", r"\b(?:hiking|tramping|backpacking)\b"),
    ("cooking/baking", r"\b(?:cooking|baking)\b"),
    ("gardening", r"\bgardening\b"),
    ("cycling/biking", r"\b(?:cycling|mountain\s+biking)\b"),
    ("kayaking/fishing/camping", r"\b(?:kayaking|fishing|camping)\b"),
]

MAORI_GREETING_SIGNOFF_PATTERNS = [
    ("Māori greeting", r"\b(?:kia\s*ora|t[eē]n[aā]\s*(?:koe|koutou))\b"),
    ("Māori signoff", r"\bng[aā]\s*mihi(?:\s*nui)?\b"),
]

CLEARANCE_OVERCLAIM_PATTERNS = [
    ("active clearance", r"\bactive\s+(?:security\s+)?clearance\b"),
    ("secret clearance", r"\b(?:currently\s+cleared|hold(?:s|ing)?\s+a\s+(?:secret|top\s+secret)|top\s+secret(?:\s+clearance)?|secret\s+clearance|TS/SCI)\b"),
]

SERVICENOW_PATTERN = re.compile(r"\bservicenow\b", re.I)

DRIVER_LICENCE_RE = re.compile(
    r"full\s+clean\s+new\s+zealand\s+class\s+1\s+driver\s+licen[cs]e\s+and\s+personal\s+vehicle",
    re.I
)


def check_semantic_guardrails(rep, label, text, is_cv=False):
    hobby_hits = [name for name, pat in FORBIDDEN_HOBBY_PATTERNS if re.search(pat, text, re.I)]
    if hobby_hits:
        rep.fail("%s leisure hobbies" % label, "Rule 7 violation - found: " + ", ".join(hobby_hits))
    else:
        rep.ok("%s leisure hobbies" % label)

    lang_hits = [name for name, pat in MAORI_GREETING_SIGNOFF_PATTERNS if re.search(pat, text, re.I)]
    if lang_hits:
        rep.fail("%s language standard" % label, "Rule 5 violation - found: " + ", ".join(lang_hits))
    else:
        rep.ok("%s language standard" % label)

    clr_hits = [name for name, pat in CLEARANCE_OVERCLAIM_PATTERNS if re.search(pat, text, re.I)]
    if clr_hits:
        rep.fail("%s clearance claims" % label, "found overstated clearance: " + ", ".join(clr_hits))
    else:
        rep.ok("%s clearance claims" % label)

    if SERVICENOW_PATTERN.search(text):
        rep.fail("%s ServiceNow check" % label, "prohibited self-study tool mentioned")
    else:
        rep.ok("%s ServiceNow check" % label)

    if is_cv:
        if DRIVER_LICENCE_RE.search(text):
            rep.ok("CV Driver Licence line", "Class 1 licence present")
        else:
            rep.fail("CV Driver Licence line", "Rule 8 violation - missing 'Full clean New Zealand Class 1 Driver Licence and personal vehicle.'")


# -----------------------------------------------------------------------------
# AI TELLS & SLOP PATTERNS (SlopMonster, Humanizer, Detection Research)
# -----------------------------------------------------------------------------
AI_BANNED_VOCAB = [
    ("delve", r"\bdelv(?:e|es|ed|ing)\b"),
    ("tapestry", r"\btapestr(?:y|ies)\b"),
    ("testament", r"\btestament\b"),
    ("pivotal", r"\bpivotal\b"),
    ("seamless", r"\bseamless(?:ly)?\b"),
    ("robust", r"\brobust\b"),
    ("leverage", r"\bleverag(?:e|es|ed|ing)\b"),
    ("elevate", r"\belevat(?:e|es|ed|ing)\b"),
    ("unlock/unleash", r"\b(?:unlock|unleash)(?:s|ed|ing)?\b"),
    ("harness", r"\bharness(?:ing)?(?:\s+the\s+power)?\b"),
    ("holistic", r"\bholistic\b"),
    ("transformative", r"\btransformative\b"),
    ("foster/cultivate", r"\b(?:foster|cultivat)(?:e|es|ed|ing)\b"),
    ("supercharge", r"\b(?:supercharg|turbocharg)(?:e|es|ed|ing)\b"),
    ("game-changer", r"\bgame[- ]chang(?:er|ing)\b"),
    ("paradigm", r"\bparadigm(?:s)?\b"),
    ("synergy", r"\bsynerg(?:y|ies)\b"),
    ("bespoke", r"\bbespoke\b"),
    ("meticulous", r"\bmeticulous(?:ly)?\b"),
    ("interplay", r"\binterplay\b"),
    ("beacon", r"\bbeacon\b"),
    ("myriad/plethora", r"\b(?:myriad|plethora)\b"),
    ("fast-paced", r"\bfast[- ]paced\b"),
    ("spearhead", r"\bspearhead(?:ed|ing|s)?\b"),
]

AI_CONSTRUCTION_PATTERNS = [
    ("not just X but Y", r"\bnot\s+(?:just|only)\b[^,.!?]{2,60}[,.]\s*(?:but|it['’]s|they|we|i\b)"),
    ("more than just", r"\bmore\s+than\s+just\b"),
    ("in todays world", r"\bin\s+today['’]s\s+(?:world|landscape|market|environment)\b"),
    ("throat-clearing opener", r"\b(?:when\s+it\s+comes\s+to|it\s+is\s+(?:worth|important\s+to)\s+(?:noting|note|understand)|needless\s+to\s+say|at\s+the\s+end\s+of\s+the\s+day)\b"),
    ("fake significance", r"\b(?:stands\s+as\s+a|serves\s+as\s+a\s+testament|marks\s+a\s+pivotal|leaves\s+an\s+indelible)\b"),
    ("em-dash tell", r"—"),
    # 9 Oct 2026: a cover letter passed this gate clean but still scored 40-76% on external
    # AI detectors (Kironraj flagged it). These two are the specific tells he pointed to -
    # self-referential meta-commentary ("is [not] something I've/I'm...") instead of a plain
    # statement, and the stock chatbot-letter closer. Neither is banned vocabulary, but both
    # are templated constructions a person drafting their own letter doesn't reach for.
    ("meta self-reference", r"\bis\s+(?:not\s+)?something\s+i(?:'ve|'m|\s+(?:have|am))\b"),
    ("stock closer", r"\bi(?:'d|\s+would)\s+welcome\s+the\s+chance\s+to\s+talk\s+this\s+through\b"),
]


def check_ai_tells(rep, label, text):
    vocab_hits = [name for name, pat in AI_BANNED_VOCAB if re.search(pat, text, re.I)]
    if vocab_hits:
        rep.fail("%s AI vocabulary tell" % label, "banned AI word(s): " + ", ".join(vocab_hits))
    else:
        rep.ok("%s AI vocabulary tell" % label)

    struct_hits = [name for name, pat in AI_CONSTRUCTION_PATTERNS if re.search(pat, text, re.I)]
    if struct_hits:
        rep.fail("%s AI structural pattern" % label, "found AI tell pattern: " + ", ".join(struct_hits))
    else:
        rep.ok("%s AI structural pattern" % label)


# 1 Oct 2026 (recruiter review): laptop/mobile support and password resets are toEvidence, not confirmed; the letter
# claimed them while the CV omitted them. Extend this list whenever Key Facts marks a skill unconfirmed.
# Claim boundary. Added 30 Sep 2026 after the reviewer caught unsupported claims in the
# two earlier letters: business-continuity work, SOP authoring, team leadership,
# and silence about an ad's Microsoft/RMM stack. None of these are in Candidate Key Facts;
# an ad asking for them is a gap to name, never a claim to echo back. Both documents.
UNSUPPORTED_CLAIM_PATTERNS = [
    ("business continuity", r"business[- ]continuity"),
    ("SOP / procedure authoring", r"\bSOPs?\b|standard operating procedures?"),
    ("team leadership", r"\b(team[- ]lead(?:er)?|line[- ]manag\w*|people[- ]manag\w*|senior (?:on-?site )?presence)\b"),
    ("team leadership", r"\b(?:led|lead(?:ing)?|supervis\w+|mentor\w+|coach\w+|manag\w+|guid\w+|allocat\w+ work (?:to|for))\s+(?:a |the |our |local |wider )*(?:small )?(?:team|staff|engineers|juniors?)\b"),
    ("mentoring / onboarding", r"\bmentoring\b|\bonboarding\b"),
    ("ticket-queue ownership", r"\b(?:managed|owned|ran|led|supervised|prioriti[sz]ed|allocated)\s+(?:the\s+)?(?:daily\s+)?(?:ticket\s+)?queue"),
    ("guarantee wording", r"\bguarantee\w*"),
    ("end-user device support (laptops/mobiles)", r"\b(?:laptops?|mobile (?:devices?|phones?)|smartphones?|tablets?|end[- ]user (?:devices?|hardware))\b"),
    # 1 Oct 2026 (Fujitsu On-Site Technician review): the letter inferred IAM and hardware/warranty skill from the
    # Master's and the 2017 ECE degree. A degree is never evidence of practised skill; cite coursework as coursework.
    ("degree-derived competence claim", r"\b(?:strong|solid|natural|deep|good)\s+(?:conceptual\s+)?(?:foundation|familiarity|grounding)\s+(?:in|with|of)\b"),
    ("identity and access management", r"identity (?:and|&) access management(?! concepts)|\bIAM\b"),
    ("hardware / warranty / device configuration", r"\bwarrant(?:y|ies)\b|hardware (?:diagnostics?|repairs?|faults?|swaps?)|device (?:configuration|imaging|enrol?lment)"),
    ("password resets / account admin", r"password[- ]resets?|reset(?:ting)? (?:user )?passwords?|account (?:unlock|provisioning)|user (?:account )?(?:creation|provisioning)|joiners?,? movers?"),
]
# Tools the record does not support. Fine only inside a sentence that admits the gap.
UNCONFIRMED_STACK = re.compile(
    r"\b(microsoft 365|m365|office 365|o365|intune|azure|sharepoint|entra|active directory|autotask|exchange online|mdm|rmm)\b", re.I)
GAP_WORDS = re.compile(
    r"\b(rather than|not yet|yet to|build\w*|learn\w*|develop\w*|grow\w*|without|new to|unfamiliar|gap|self-study|no prior|limited)\b", re.I)


def _without_confirmed_bullets(text):
    """CV bullets that appear word for word in cv-evidence.json were confirmed by Jordan (12 Oct 2026:
    trained new starters, guided juniors, covered for a lead at Northline). The patterns below predate
    that confirmation, so they must not flag these exact lines. Anything reworded still gets checked."""
    # Referees' own job titles ("Team Lead") are not claims about Kironraj, so the References block is not scanned.
    text = re.split(r"(?im)^\s*references\s*$", text, maxsplit=1)[0]
    flat = re.sub(r"\s+", " ", text)
    try:
        ev = cv_engine.load(cv_engine.EVIDENCE)
        for role in ev.get("roles", []):
            for b in role.get("bullets", []):
                flat = flat.replace(re.sub(r"\s+", " ", b["text"]), " ")
    except Exception:
        pass
    return flat


def check_claim_boundary(rep, label, text, is_cv=False):
    if is_cv:
        text = _without_confirmed_bullets(text)
    hits = sorted({n for n, pat in UNSUPPORTED_CLAIM_PATTERNS if re.search(pat, text, re.I)})
    if hits:
        rep.fail("%s claim boundary" % label, "unsupported claim(s) not in Candidate Key Facts: " + ", ".join(hits))
    else:
        rep.ok("%s claim boundary" % label)
    stack = []
    for sent in re.split(r"(?<=[.!?])\s+|\n", text):
        m = UNCONFIRMED_STACK.search(sent)
        if m and (is_cv or not GAP_WORDS.search(sent)):
            stack.append(m.group(0))
    if stack:
        rep.fail("%s unconfirmed tooling" % label,
                 "%s named as if held; the record has no hands-on evidence. On a cover letter, name it only "
                 "as a gap ('rather than', 'build toward')" % ", ".join(sorted(set(stack), key=str.lower)))
    else:
        rep.ok("%s unconfirmed tooling" % label)


def check_evidence(rep, cv_text):
    """Every lexicon skill on the CV must be provable from cv-evidence.json, and employer
    job titles must be the real ones. Catches LLM-drafted CVs too (Zendesk/Jira/CIMS and
    'Operations & Network Incident Coordinator' on the 25 Sep 2026 draft)."""
    lex, ev = cv_engine.load(cv_engine.LEXICON), cv_engine.load(cv_engine.EVIDENCE)
    hard, soft = cv_engine.unevidenced(cv_text, lex, ev)
    if hard:
        rep.fail("CV unevidenced claims", "not in cv-evidence.json: " + ", ".join(hard))
    else:
        rep.ok("CV unevidenced claims")
    if soft:
        rep.warn("CV unevidenced soft skills", ", ".join(soft) + " (add to claims once Jordan confirms)")
    titles = cv_engine.title_violations(cv_text, ev)
    if titles:
        rep.fail("CV job titles", "; ".join(titles))
    else:
        rep.ok("CV job titles", "match the evidence bank")


def verify(folder, keywords, role=None, cv_only=False, job_text=""):
    rep = Report()
    cv_pdf, cv_docx, cl_docx = find_docs(folder, role)

    cv_text = ""
    if not cv_pdf:
        rep.fail("CV PDF present", "no 'CV - *.pdf' in %s" % folder)
    else:
        info = run(["pdfinfo", cv_pdf])
        if info is None:
            rep.warn("CV page/size gate", "pdfinfo unavailable - gate skipped")
        else:
            pages = re.search(r"^Pages:\s+(\d+)", info, re.M)
            size = re.search(r"^Page size:\s+([\d.]+) x ([\d.]+)", info, re.M)
            if pages and int(pages.group(1)) > MAX_CV_PAGES:
                rep.fail("CV page count", "%s pages (max %d) - cut content, don't shrink type"
                         % (pages.group(1), MAX_CV_PAGES))
            elif pages:
                rep.ok("CV page count", "%s page(s)" % pages.group(1))
            if size:
                dims = (round(float(size.group(1))), round(float(size.group(2))))
                if abs(dims[0] - A4_PTS[0]) > 3 or abs(dims[1] - A4_PTS[1]) > 3:
                    rep.fail("CV page size", "%dx%d pts - not A4, page setup was skipped" % dims)
                else:
                    rep.ok("CV page size", "A4")

        cv_text = run(["pdftotext", cv_pdf, "-"]) or ""
        if len(cv_text.strip()) < 200:
            rep.fail("CV text layer", "pdftotext returned almost nothing - the PDF won't parse")
        else:
            rep.ok("CV text layer", "%d chars extracted" % len(cv_text.strip()))
            check_pii(rep, "CV", cv_text)
            check_dangling(rep, "CV", cv_text, docx_text(cv_docx) if cv_docx else "")
            check_semantic_guardrails(rep, "CV", cv_text, is_cv=True)
            check_ai_tells(rep, "CV", cv_text)
            check_claim_boundary(rep, "CV", cv_text, is_cv=True)
            check_evidence(rep, cv_text)

    cl_text = ""
    if cv_only:
        pass
    elif not cl_docx:
        rep.fail("Cover letter present", "no 'Cover Letter - *.docx' in %s" % folder)
    else:
        cl_text = docx_text(cl_docx)
        words = len(letter_body(cl_text).split())
        if not CL_WORDS_HARD[0] <= words <= CL_WORDS_HARD[1]:
            rep.fail("Cover letter length", "%d words (hard range %d-%d)" % ((words,) + CL_WORDS_HARD))
        elif not CL_WORDS_TARGET[0] <= words <= CL_WORDS_TARGET[1]:
            rep.warn("Cover letter length", "%d words - in range, outside the %d-%d target"
                     % ((words,) + CL_WORDS_TARGET))
        else:
            rep.ok("Cover letter length", "%d words" % words)
        check_pii(rep, "Cover letter", cl_text)
        check_dangling(rep, "Cover letter", cl_text, cl_text)
        check_semantic_guardrails(rep, "Cover letter", cl_text, is_cv=False)
        check_ai_tells(rep, "Cover letter", cl_text)
        check_claim_boundary(rep, "Cover letter", cl_text)

    # The visa is the one fact stated in both documents, so it's the one that
    # drifts. A reviewer pass caught it worded two ways in the same application.
    if cv_text and cl_text:
        cv_visa = set(m.group(0).lower().strip() for m in VISA_RE.finditer(cv_text))
        cl_visa = set(m.group(0).lower().strip() for m in VISA_RE.finditer(cl_text))
        if not cv_visa and not cl_visa:
            rep.ok("Visa wording", "not stated in either document")
        elif cv_visa & cl_visa:
            rep.ok("Visa wording", "matches: %s" % sorted(cv_visa & cl_visa)[0])
        else:
            rep.fail("Visa wording", "CV says %s, cover letter says %s"
                     % (sorted(cv_visa) or "nothing", sorted(cl_visa) or "nothing"))

    # A keyword written into the docx but absent from the extracted text is a
    # formatting regression (a run split across a style boundary), not a
    # content problem — worth surfacing, not worth failing the build over.
    if keywords and cv_text and not job_text:   # superseded by the local ATS score when the ad is saved
        low = cv_text.lower()
        literal = [k for k in keywords if is_literal_term(k)]
        skipped = len(keywords) - len(literal)
        note = " (%d descriptive phrase%s not checked)" % (skipped, "" if skipped == 1 else "s") if skipped else ""
        absent = [k for k in literal if not keyword_present(k, low)]
        if absent:
            rep.warn("ATS keywords in PDF text", "missing: " + ", ".join(absent) + note)
        elif literal:
            rep.ok("ATS keywords in PDF text", "%d/%d literal terms present%s" % (len(literal), len(literal), note))
        else:
            rep.warn("ATS keywords in PDF text", "no literal terms to check%s" % note)

    if job_text and cv_text:
        kws = cv_engine.extract(job_text, cv_engine.load(cv_engine.LEXICON))
        s = cv_engine.score_all(kws, cv_text, role or "", cv_pdf, cv_docx)
        detail = "overall %d (hard %s, soft %s, search %s, format %s)" % (
            s["overall"], s["hard"], s["soft"], s["search"], s["format"])
        if s["overall"] >= ATS_TARGET:
            rep.ok("Local ATS score", detail + (("; missing: " + ", ".join(s["missing"])) if s["missing"] else ""))
        else:
            rep.warn("Local ATS score", detail + "; below %d, missing: %s" % (ATS_TARGET, ", ".join(s["missing"])))

    return rep


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--match-key", help="matchKey (or id) in applications.json")
    ap.add_argument("--folder", help="folder to check, relative to 'Career and Job' or absolute")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--role", help="role title, to pick the right files when a folder holds several")
    ap.add_argument("--cv-only", action="store_true", help="skip cover-letter checks (deterministic no-LLM path)")
    args = ap.parse_args()

    folder = args.folder
    keywords = []
    role = args.role
    job_text = ""
    if args.match_key:
        entry = entry_for(args.match_key)
        if not entry:
            print("no entry matching %r" % args.match_key, file=sys.stderr)
            return 2
        folder = folder or entry.get("folderPath") or ""
        role = entry.get("role")
        job_text = entry.get("jobText") or ""
        ats = (entry.get("analysis") or {}).get("ats") or {}
        keywords = list(ats.get("matched") or []) + list(ats.get("toEvidence") or [])
    if not folder:
        ap.error("need --folder or a --match-key whose entry has a folderPath")
    if not os.path.isabs(folder):
        folder = os.path.join(ROOT, folder)
    if not os.path.isdir(folder):
        print("no such folder: %s" % folder, file=sys.stderr)
        return 2

    rep = verify(folder, keywords, role, args.cv_only, job_text)
    if args.json:
        print(json.dumps({"folder": folder, "pass": not rep.failed, "checks": rep.checks}, indent=2))
    else:
        for c in rep.checks:
            print("%-5s %-28s %s" % (c["level"], c["check"], c["detail"]))
        print("\n%s — %s" % ("PASS" if not rep.failed else "FAIL", folder))
    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main())

