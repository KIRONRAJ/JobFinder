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
GREETING_RE = re.compile(r"^\s*(kia ora|dear|t[eē]n[aā] koe|hi )", re.I | re.M)


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


def find_docs(folder):
    cv_pdf = cv_docx = cl_docx = None
    for name in sorted(os.listdir(folder)):
        low = name.lower()
        full = os.path.join(folder, name)
        if low.startswith("cv - ") and low.endswith(".pdf"):
            cv_pdf = full
        elif low.startswith("cv - ") and low.endswith(".docx"):
            cv_docx = full
        elif low.startswith("cover letter - ") and low.endswith(".docx"):
            cl_docx = full
    return cv_pdf, cv_docx, cl_docx


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


def verify(folder, keywords):
    rep = Report()
    cv_pdf, cv_docx, cl_docx = find_docs(folder)

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

    cl_text = ""
    if not cl_docx:
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
    if keywords and cv_text:
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

    return rep


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--match-key", help="matchKey (or id) in applications.json")
    ap.add_argument("--folder", help="folder to check, relative to 'Career and Job' or absolute")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    folder = args.folder
    keywords = []
    if args.match_key:
        entry = entry_for(args.match_key)
        if not entry:
            print("no entry matching %r" % args.match_key, file=sys.stderr)
            return 2
        folder = folder or entry.get("folderPath") or ""
        ats = (entry.get("analysis") or {}).get("ats") or {}
        keywords = list(ats.get("matched") or []) + list(ats.get("toEvidence") or [])
    if not folder:
        ap.error("need --folder or a --match-key whose entry has a folderPath")
    if not os.path.isabs(folder):
        folder = os.path.join(ROOT, folder)
    if not os.path.isdir(folder):
        print("no such folder: %s" % folder, file=sys.stderr)
        return 2

    rep = verify(folder, keywords)
    if args.json:
        print(json.dumps({"folder": folder, "pass": not rep.failed, "checks": rep.checks}, indent=2))
    else:
        for c in rep.checks:
            print("%-5s %-28s %s" % (c["level"], c["check"], c["detail"]))
        print("\n%s — %s" % ("PASS" if not rep.failed else "FAIL", folder))
    return 1 if rep.failed else 0


if __name__ == "__main__":
    sys.exit(main())
