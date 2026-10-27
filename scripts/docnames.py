"""Filename rules for generated CV / cover-letter files (set 14 Oct 2026).

    CV - Jordan Smith - <Company>.docx / .pdf
    Cover Letter - Jordan Smith - <Company>.docx / .pdf

When the same company folder already holds a CV for another role, a short role
tag is appended:  CV - Jordan Smith - <Company> - <Role tag>.docx

The `CV - ` and `Cover Letter - ` prefixes are load-bearing: verify-docs.py and
server/review-loop.js find files by them. Keep them.
"""
import re

CANDIDATE = 'Jordan Smith'
_MAX_TAG_WORDS = 4
_DATE_RE = re.compile(r'\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,4}\b|\b20\d{2}\b|\bfixed[- ]term\b|\bto\b\s*$', re.I)


def short_role_tag(role):
    """Job title only: no brackets, no text after a separator, no dates, <= 4 words."""
    s = re.sub(r'\([^)]*\)', ' ', role or '')
    s = re.split(r'\s[-|:/]\s|[,;|:]', s)[0]
    s = _DATE_RE.sub(' ', s)
    s = re.sub(r'[^A-Za-z0-9 ]', ' ', s)
    return ' '.join(s.split()[:_MAX_TAG_WORDS])


def doc_basename(kind, company, role, with_role_tag):
    """kind is 'CV' or 'Cover Letter'. Returns the name without extension."""
    parts = [kind, CANDIDATE, company]
    if with_role_tag:
        tag = short_role_tag(role)
        if tag:
            parts.append(tag)
    return ' - '.join(parts)
