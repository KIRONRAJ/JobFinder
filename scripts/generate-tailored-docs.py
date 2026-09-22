#!/usr/bin/env python3
"""Generates tailored CV and Cover Letter DOCX + PDF files grounded in Candidate Key Facts.

Adheres strictly to the SOT Red & Black visual design system:
- Palette: #981525 (Red), #111111 (Black), #222222 (Dark), #5B6B78 (Muted).
- Distinct header vertical breathing room and dedicated Driver Licence line.
- Red bottom border dividers on headers and section headings.
- Intelligent work history sequencing (Page 1 leads with core technical roles).
- Strict 2-page A4 geometry for CV with clean line spacing and balanced margins.
- Cover Letter word budget strictly 330–365 words on a single A4 page.
- Strictly standard English throughout (no Māori greetings/signoffs).
- Zero personal leisure hobbies (Rule 57).

Usage:
    python generate-tailored-docs.py --input /path/to/spec.json
    python generate-tailored-docs.py --input /path/to/spec.json --convert-pdf --verify
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# =============================================================================
# COLOR PALETTE & GEOMETRY (SOT RED & BLACK STANDARD)
# =============================================================================
HEX_RED = "981525"
COLOR_RED = RGBColor(152, 21, 37)
COLOR_BLACK = RGBColor(17, 17, 17)
COLOR_DARK = RGBColor(34, 34, 34)
COLOR_MUTED = RGBColor(91, 107, 120)

A4_WIDTH = Inches(8.27)
A4_HEIGHT = Inches(11.69)

DEFAULT_PROJECTS = [
    {
        'title': "Master's Research Project - Replay Attack Prevention in Smart Car IoT Systems",
        'subtitle': 'Riverside Institute of Technology, Wellington  |  2025 - 2026',
        'bullets': [
            'Investigated replay vulnerabilities in vehicular IoT communications where attackers intercept and retransmit valid messages.',
            'Assessed limitations of existing nonce-based and counter-based mechanisms, and designed and evaluated a hybrid defence in a simulated smart-vehicle environment, analyzing replay detection rate, latency, and attack mitigation efficiency.'
        ]
    },
    {
        'title': 'JobFinder Automation Platform (JobSearchHQ)',
        'subtitle': 'Autonomous Systems Build  |  2026',
        'bullets': [
            'Engineered an autonomous 24/7 job tracking and document generation platform running on an Ubuntu Linux microserver with automated reporting and alert daemons.'
        ]
    },
    {
        'title': 'Intelligent Aquaponics Automation System',
        'subtitle': 'Practical Engineering Build  |  2017 - 2019',
        'bullets': [
            'Engineered an automated hardware control and telemetry system combining fish tanks with hydroponic beds, using relay-controlled pumps, failsafe aerators, and environmental sensor probes.'
        ]
    }
]

DEFAULT_CERTS = [
    'Red Hat Certified System Administrator (RHCSA, RHEL 7) - Certificate ID: 170-264-105 (Earned Dec 2017)',
    'CCNA Routing & Switching Coursework - Vidya Academy of Science and Technology (training certificate)',
    'cPanel Professional Certification (CPP) & cPanel & WHM Administrator (CWA) - held 2021-2022',
    'freeCodeCamp Responsive Web Design Certification - approx. 300 hours of technical coursework'
]

UNGROUNDED_REPLACEMENTS = [
    (r'\bKraken(?:\s+platform)?\b', 'enterprise utility/billing platform'),
]

# Hyphen variants (0x2010-0x2015) plus the minus sign (0x2212) - covers en dash (0x2013)
# and em dash (0x2014), which read as an AI writing tell.
_DASH_RE = re.compile('[' + ''.join(chr(c) for c in list(range(0x2010, 0x2016)) + [0x2212]) + ']')

def scrub_ungrounded_terms(text):
    if not text:
        return ''
    cleaned = str(text)
    cleaned = _DASH_RE.sub('-', cleaned)
    for pattern, replacement in UNGROUNDED_REPLACEMENTS:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.I)
    return cleaned

def clean_profile_text(text):
    if not text:
        return ''
    cleaned = scrub_ungrounded_terms(text)
    # Remove any echoed header/contact info, labels, visa, or licence lines
    cleaned = re.sub(r'jordan\s+smith', '', cleaned, flags=re.I)
    cleaned = re.sub(r'petone,\s*lower\s*hutt[^\n|.]*?[|.]?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'\+64\s*2[0-9]\s*[0-9]{3}\s*[0-9]{4}[^\n|.]*?[|.]?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'jordan\.smith\.demo@example\.com[^\n|.]*?[|.]?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'(?:web:\s*)?www\.jordan\.com[^\n|.]*?[|.]?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'(?:linkedin:\s*)?linkedin\.com/in/jordansmithdemo[^\n|.]*?[|.]?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'\b(professional\s+summary|career\s+objective|profile):\s*', '', cleaned, flags=re.I)
    cleaned = re.sub(r'Work\s+Eligibility:[^.\n]*\.?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'(?:Full\s+)?clean\s+New\s+Zealand\s+Class\s+1\s+Driver\s+Licence[^.\n]*\.?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'3-year\s+Post\s+Study\s+Work\s+Visa[^.\n]*\.?', '', cleaned, flags=re.I)
    cleaned = re.sub(r'^[|\s–-]+', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def sanitize_filename(name):
    clean = _DASH_RE.sub('-', name)
    clean = re.sub(r'\s*[/\\|]\s*', ' - ', clean)
    clean = re.sub(r'[^A-Za-z0-9 \-]', '', clean)  # strip everything else (parens, punctuation, non-ASCII)
    clean = re.sub(r'\s+', ' ', clean)
    clean = re.sub(r'-{2,}', '-', clean)
    return clean.strip(' -')

def add_bottom_border(paragraph, color_hex="981525", size="8"):
    """Adds a crisp bottom border line to a paragraph."""
    pPr = paragraph._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), str(size))  # 8 = 1 pt, 6 = 0.75 pt
    bottom.set(qn('w:space'), '3')
    bottom.set(qn('w:color'), color_hex)
    pBdr.append(bottom)
    pPr.append(pBdr)

def add_p(doc, text='', font_size=9.2, bold=False, italic=False, color=COLOR_DARK,
          space_before=0.0, space_after=2.0, line_spacing=1.08, align=WD_ALIGN_PARAGRAPH.LEFT):
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = line_spacing
    if text:
        r = p.add_run(text)
        r.font.name = 'Calibri'
        r.font.size = Pt(font_size)
        r.bold = bold
        r.italic = italic
        r.font.color.rgb = color
    return p

def add_section_heading(doc, title, space_before=5.5, space_after=2.5):
    p = add_p(doc, title.upper(), font_size=11.0, bold=True, color=COLOR_RED,
              space_before=space_before, space_after=space_after)
    add_bottom_border(p, color_hex=HEX_RED, size="6")  # 0.75pt border
    return p

def normalize_skill(s):
    if isinstance(s, str):
        if ':' in s:
            cat, detail = s.split(':', 1)
            return scrub_ungrounded_terms(cat.strip() + ': '), scrub_ungrounded_terms(detail.strip())
        return '', scrub_ungrounded_terms(s.strip())
    cat = s.get('category') or s.get('heading') or s.get('name') or ''
    if cat and not cat.endswith(': '):
        cat = cat.rstrip(':') + ': '
    detail = s.get('detail') or s.get('narrative') or s.get('description') or s.get('skills') or ''
    if isinstance(detail, list):
        detail = ', '.join(str(d) for d in detail)
    return scrub_ungrounded_terms(cat), scrub_ungrounded_terms(str(detail).strip())

def normalize_job(j):
    if isinstance(j, str):
        return {'role': j, 'company': '', 'period': '', 'bullets': []}
    role = j.get('role') or j.get('title') or j.get('position') or ''
    company = j.get('company') or j.get('employer') or j.get('organization') or ''
    period = j.get('period') or f"{j.get('dates', '')} | {j.get('location', '')}".strip(' |')
    raw_bullets = j.get('bullets')
    if not raw_bullets:
        raw_bullets = j.get('details') or j.get('detail') or []
    if isinstance(raw_bullets, str):
        bullets = [b.strip() for b in raw_bullets.split('\n') if b.strip()]
    elif isinstance(raw_bullets, list):
        bullets = [str(b).strip() for b in raw_bullets if str(b).strip()]
    else:
        bullets = []
    return {
        'role': scrub_ungrounded_terms(role),
        'company': scrub_ungrounded_terms(company),
        'period': scrub_ungrounded_terms(period),
        'bullets': [scrub_ungrounded_terms(b) for b in bullets]
    }

def normalize_edu(e):
    if isinstance(e, str):
        return {'title': e, 'institution': '', 'bullets': []}
    title = e.get('title') or e.get('degree') or ''
    institution = e.get('institution') or e.get('school') or e.get('university') or ''
    raw_bullets = e.get('bullets') or e.get('details') or []
    if isinstance(raw_bullets, str):
        bullets = [b.strip() for b in raw_bullets.split('\n') if b.strip()]
    elif isinstance(raw_bullets, list):
        bullets = [str(b).strip() for b in raw_bullets if str(b).strip()]
    else:
        bullets = []
    return {'title': scrub_ungrounded_terms(title), 'institution': scrub_ungrounded_terms(institution), 'bullets': bullets}

def order_work_history(parsed_history, target_role=""):
    """Intelligently sort roles so that relevant core technical experience leads on Page 1."""
    is_trade = bool(re.search(r'(mechanic|line|labour|trade|trainee|driver|warehouse|packaging)', target_role, re.I))
    if is_trade:
        def trade_rank(j):
            r = (j.get('role', '') + ' ' + j.get('company', '')).lower()
            if 'tuatara' in r or 'labour' in r:
                return 0
            if 'northline' in r or 'noc' in r:
                return 1
            if 'cascade' in r or 'support' in r or 'systems' in r:
                return 2
            return 3
        return sorted(parsed_history, key=trade_rank)
    else:
        # For IT, systems, network, cyber, support, and banking roles:
        # Prioritize Cascade Infovision and Northline Broadband on Page 1
        def it_rank(j):
            r = (j.get('role', '') + ' ' + j.get('company', '')).lower()
            if 'cascade' in r or 'support' in r or 'systems' in r or 'software' in r:
                return 0
            if 'northline' in r or 'noc' in r or 'network' in r:
                return 1
            if 'self' in r or 'freelance' in r:
                return 2
            if 'tuatara' in r or 'brewery' in r or 'labour' in r:
                return 3
            return 4
        return sorted(parsed_history, key=it_rank)

def generate_cv(spec, out_docx):
    doc = docx.Document()
    sec = doc.sections[0]
    sec.page_width = A4_WIDTH
    sec.page_height = A4_HEIGHT
    sec.top_margin = Pt(36)
    sec.bottom_margin = Pt(36)
    sec.left_margin = Pt(46)
    sec.right_margin = Pt(46)

    target_role = spec.get('role', '')

    # =========================================================================
    # HEADER (Strict SOT Red & Black Rules)
    # =========================================================================
    add_p(doc, 'JORDAN SMITH', font_size=17.0, bold=True, color=COLOR_BLACK,
          space_before=0.0, space_after=2.0, align=WD_ALIGN_PARAGRAPH.LEFT)

    p_contact = add_p(doc, space_before=0.0, space_after=5.0)
    runs_contact = [
        ('Petone, Lower Hutt, Wellington', False, COLOR_DARK),
        ('  |  ', False, COLOR_RED),
        ('+64 21 555 0100', False, COLOR_DARK),
        ('  |  ', False, COLOR_RED),
        ('jordan.smith.demo@example.com', False, COLOR_DARK),
        ('  |  ', False, COLOR_RED),
        ('www.example.com', False, COLOR_DARK),
        ('  |  ', False, COLOR_RED),
        ('linkedin.com/in/jordansmithdemo', False, COLOR_DARK)
    ]
    for text, bold, col in runs_contact:
        r = p_contact.add_run(text)
        r.font.name = 'Calibri'
        r.font.size = Pt(7.8)
        r.bold = bold
        r.font.color.rgb = col

    # Breathing space [ SPACE ]
    p_visa = add_p(doc, space_before=3.0, space_after=2.0)
    r_v1 = p_visa.add_run('Work Eligibility: ')
    r_v1.bold = True
    r_v1.font.color.rgb = COLOR_RED
    r_v2 = p_visa.add_run('3-year Post Study Work Visa (Open Work Visa) - full open work rights, no sponsorship required.')
    r_v2.font.color.rgb = COLOR_DARK
    for r in (r_v1, r_v2):
        r.font.name = 'Calibri'
        r.font.size = Pt(8.8)

    # Dedicated Driver Licence line
    p_licence = add_p(doc, space_before=0.0, space_after=5.0)
    r_l1 = p_licence.add_run('Driver Licence & Mobility: ')
    r_l1.bold = True
    r_l1.font.color.rgb = COLOR_RED
    r_l2 = p_licence.add_run('Full clean New Zealand Class 1 Driver Licence and personal vehicle.')
    r_l2.font.color.rgb = COLOR_DARK
    for r in (r_l1, r_l2):
        r.font.name = 'Calibri'
        r.font.size = Pt(8.8)

    add_bottom_border(p_licence, color_hex=HEX_RED, size="10")

    # =========================================================================
    # 1. PROFESSIONAL PROFILE
    # =========================================================================
    add_section_heading(doc, 'Professional Profile', space_before=5.0, space_after=2.5)
    raw_profile = spec.get('profile') or spec.get('careerObjective') or ''
    profile_text = clean_profile_text(raw_profile)
    add_p(doc, profile_text, font_size=9.1, space_after=4.5, line_spacing=1.08)

    # =========================================================================
    # 2. CORE COMPETENCIES & TECHNICAL SKILLS
    # =========================================================================
    add_section_heading(doc, 'Core Competencies & Technical Skills', space_before=5.0, space_after=2.5)
    raw_skills = spec.get('skills') or spec.get('skillsSummary') or []
    for item in raw_skills[:5]:
        cat, detail = normalize_skill(item)
        p_s = add_p(doc, space_after=2.0, line_spacing=1.06)
        rb = p_s.add_run('•  ')
        rb.font.color.rgb = COLOR_RED
        rb.bold = True
        if cat:
            rt1 = p_s.add_run(cat)
            rt1.bold = True
            rt1.font.color.rgb = COLOR_BLACK
        rt2 = p_s.add_run(detail)
        rt2.font.color.rgb = COLOR_DARK
        for r in p_s.runs:
            r.font.name = 'Calibri'
            r.font.size = Pt(8.8)

    # =========================================================================
    # 3. WORK HISTORY & PRACTICAL EXPERIENCE
    # =========================================================================
    add_section_heading(doc, 'Work History & Practical Experience', space_before=5.0, space_after=2.5)
    raw_history = spec.get('workHistory') or spec.get('detailedExperience') or []
    parsed_history = []
    for j in raw_history:
        job = normalize_job(j)
        if not job['bullets'] and j.get('narrative'):
            raw_narr = scrub_ungrounded_terms(j['narrative'])
            sentences = [s.strip() for s in re.split(r'\.\s+', raw_narr) if s.strip()]
            job['bullets'] = [s + ('.' if not s.endswith('.') else '') for s in sentences]
        parsed_history.append(job)

    # Re-order so primary technical experience leads for IT roles
    sorted_history = order_work_history(parsed_history, target_role)

    # Page 1 gets top 2 roles (e.g. Cascade and Northline)
    page1_jobs = sorted_history[:2]
    page2_jobs = sorted_history[2:]

    for idx, job in enumerate(page1_jobs):
        sp_bef = 2.0 if idx == 0 else 3.0
        add_p(doc, job['role'], font_size=9.8, bold=True, color=COLOR_BLACK, space_before=sp_bef, space_after=1.0)
        p_sub = add_p(doc, space_after=2.0)
        r_co = p_sub.add_run(job['company'])
        r_co.bold = True
        r_co.font.color.rgb = COLOR_DARK
        if job['period']:
            r_dt = p_sub.add_run(f"   |   {job['period']}")
            r_dt.italic = True
            r_dt.font.color.rgb = COLOR_RED
        for r in p_sub.runs:
            r.font.name = 'Calibri'
            r.font.size = Pt(8.8)

        for b in job['bullets'][:4]:
            p_b = add_p(doc, space_after=1.8, line_spacing=1.06)
            rb = p_b.add_run('•  ')
            rb.font.color.rgb = COLOR_RED
            rb.bold = True
            rt = p_b.add_run(b)
            rt.font.color.rgb = COLOR_DARK
            for r in (rb, rt):
                r.font.name = 'Calibri'
                r.font.size = Pt(8.8)

    # =========================================================================
    # PAGE 2: Secondary Experience, Education, Projects, Certifications
    # =========================================================================
    doc.add_page_break()

    for idx, job in enumerate(page2_jobs):
        sp_bef = 2.0 if idx == 0 else 3.5
        add_p(doc, job['role'], font_size=9.8, bold=True, color=COLOR_BLACK, space_before=sp_bef, space_after=1.0)
        p_sub = add_p(doc, space_after=2.0)
        r_co = p_sub.add_run(job['company'])
        r_co.bold = True
        r_co.font.color.rgb = COLOR_DARK
        if job['period']:
            r_dt = p_sub.add_run(f"   |   {job['period']}")
            r_dt.italic = True
            r_dt.font.color.rgb = COLOR_RED
        for r in p_sub.runs:
            r.font.name = 'Calibri'
            r.font.size = Pt(8.8)

        for b in job['bullets'][:3]:
            p_b = add_p(doc, space_after=2.0, line_spacing=1.06)
            rb = p_b.add_run('•  ')
            rb.font.color.rgb = COLOR_RED
            rb.bold = True
            rt = p_b.add_run(b)
            rt.font.color.rgb = COLOR_DARK
            for r in (rb, rt):
                r.font.name = 'Calibri'
                r.font.size = Pt(8.9)

    # =========================================================================
    # 4. EDUCATION & ACADEMIC QUALIFICATIONS
    # =========================================================================
    add_section_heading(doc, 'Education & Academic Qualifications', space_before=5.5, space_after=2.5)
    raw_edu = spec.get('education', [])
    parsed_edu = [normalize_edu(e) for e in raw_edu]
    if not parsed_edu:
        parsed_edu = [
            {
                'title': 'Master of Information Technology (Cyber Security specialisation, completed with Merit)',
                'institution': 'Riverside Institute of Technology, Wellington, New Zealand   |   07/2024 - 07/2025',
                'bullets': ['Advanced tertiary ICT qualification covering Information Security Standards and Operations (Grade A), risk governance, and security architecture.']
            },
            {
                'title': 'Bachelor of Technology in Electronics and Communication Engineering',
                'institution': 'Jyothi Engineering College, affiliated to the University of Calicut, India   |   06/2013 - 07/2017',
                'bullets': ['Four-year engineering degree providing rigorous training in digital telecommunications, electronic circuits, and laboratory diagnostics.']
            }
        ]

    for idx, edu in enumerate(parsed_edu):
        sp_bef = 1.5 if idx == 0 else 2.5
        add_p(doc, edu['title'], font_size=9.8, bold=True, color=COLOR_BLACK, space_before=sp_bef, space_after=0.5)
        if edu['institution']:
            p_inst = add_p(doc, space_after=2.0)
            parts = edu['institution'].split('|')
            r_inst = p_inst.add_run(parts[0].strip())
            r_inst.bold = True
            r_inst.font.color.rgb = COLOR_DARK
            if len(parts) > 1:
                r_dates = p_inst.add_run(f"   |   {parts[1].strip()}")
                r_dates.italic = True
                r_dates.font.color.rgb = COLOR_RED
            for r in p_inst.runs:
                r.font.name = 'Calibri'
                r.font.size = Pt(8.8)

        for b in edu.get('bullets', []):
            p_eb = add_p(doc, space_after=2.5, line_spacing=1.06)
            rb = p_eb.add_run('•  ')
            rb.font.color.rgb = COLOR_RED
            rb.bold = True
            rt = p_eb.add_run(scrub_ungrounded_terms(str(b)))
            rt.font.color.rgb = COLOR_DARK
            for r in (rb, rt):
                r.font.name = 'Calibri'
                r.font.size = Pt(8.9)

    # =========================================================================
    # 5. TECHNICAL SYSTEMS & AUTOMATION
    # =========================================================================
    add_section_heading(doc, 'Technical Systems & Automation', space_before=5.5, space_after=2.5)
    projects = [
        ("Master's Research Project - Replay Attack Prevention in Smart Car IoT Systems: ",
         "Investigated replay-attack vulnerabilities in vehicular IoT communications and developed a hybrid nonce/counter mitigation model in a simulated smart-vehicle network, benchmarked on detection rate, latency, and mitigation efficacy."),
        ("JobFinder Automation Platform (JobSearchHQ): ",
         "Engineered an autonomous 24/7 workflow tracking system running on an Ubuntu Linux microserver. Demonstrates practical initiative, attention to detail, structured audit logging, and process automation."),
        ("Homelab & Multi-OS Systems: ",
         "Maintain a multi-device home lab (Raspberry Pi 4/5) with local DNS, secure network segmentation, and Home Assistant IoT automation. Hands-on experience administering mixed Windows, Linux, and macOS endpoints.")
    ]

    for title, desc in projects:
        p_h = add_p(doc, space_after=2.4, line_spacing=1.06)
        rb = p_h.add_run('•  ')
        rb.font.color.rgb = COLOR_RED
        rb.bold = True
        rt1 = p_h.add_run(title)
        rt1.bold = True
        rt1.font.color.rgb = COLOR_BLACK
        rt2 = p_h.add_run(desc)
        rt2.font.color.rgb = COLOR_DARK
        for r in (rb, rt1, rt2):
            r.font.name = 'Calibri'
            r.font.size = Pt(8.9)

    # =========================================================================
    # 6. CERTIFICATIONS & PROFESSIONAL DEVELOPMENT
    # =========================================================================
    add_section_heading(doc, 'Certifications & Professional Development', space_before=5.5, space_after=2.5)
    raw_certs = spec.get('certifications') or DEFAULT_CERTS
    cleaned_certs = []
    for c in raw_certs:
        c_text = c if isinstance(c, str) else str(c.get('name', c.get('title', c)))
        if 'servicenow' in c_text.lower():
            continue
        cleaned_certs.append(c_text)

    for c_text in cleaned_certs[:4]:
        p_c = add_p(doc, space_after=2.0, line_spacing=1.06)
        rb = p_c.add_run('•  ')
        rb.font.color.rgb = COLOR_RED
        rb.bold = True
        rt = p_c.add_run(scrub_ungrounded_terms(c_text))
        rt.font.color.rgb = COLOR_DARK
        for r in (rb, rt):
            r.font.name = 'Calibri'
            r.font.size = Pt(8.9)

    os.makedirs(os.path.dirname(os.path.abspath(out_docx)), exist_ok=True)
    doc.save(out_docx)
    return out_docx

def generate_cover_letter(spec, out_docx):
    doc = docx.Document()
    sec = doc.sections[0]
    sec.page_width = A4_WIDTH
    sec.page_height = A4_HEIGHT
    sec.top_margin = Pt(40)
    sec.bottom_margin = Pt(40)
    sec.left_margin = Pt(50)
    sec.right_margin = Pt(50)

    # Header (SOT Red & Black standard)
    add_p(doc, 'JORDAN SMITH', font_size=16.0, bold=True, color=COLOR_BLACK,
          space_before=0.0, space_after=2.0)

    p_contact = add_p(doc, space_before=0.0, space_after=5.0)
    runs_contact = [
        ('Petone, Lower Hutt, Wellington', False, COLOR_DARK),
        ('  |  ', False, COLOR_RED),
        ('+64 21 555 0100', False, COLOR_DARK),
        ('  |  ', False, COLOR_RED),
        ('jordan.smith.demo@example.com', False, COLOR_DARK),
        ('  |  ', False, COLOR_RED),
        ('www.example.com', False, COLOR_DARK)
    ]
    for text, bold, col in runs_contact:
        r = p_contact.add_run(text)
        r.font.name = 'Calibri'
        r.font.size = Pt(8.2)
        r.bold = bold
        r.font.color.rgb = col

    p_visa = add_p(doc, space_before=3.0, space_after=2.0)
    r_v1 = p_visa.add_run('Work Eligibility: ')
    r_v1.bold = True
    r_v1.font.color.rgb = COLOR_RED
    r_v2 = p_visa.add_run('3-year Post Study Work Visa (Open Work Visa) - full open work rights, no sponsorship required.')
    r_v2.font.color.rgb = COLOR_DARK
    for r in (r_v1, r_v2):
        r.font.name = 'Calibri'
        r.font.size = Pt(8.8)

    p_licence = add_p(doc, space_before=0.0, space_after=5.0)
    r_l1 = p_licence.add_run('Driver Licence & Mobility: ')
    r_l1.bold = True
    r_l1.font.color.rgb = COLOR_RED
    r_l2 = p_licence.add_run('Full clean New Zealand Class 1 Driver Licence and personal vehicle.')
    r_l2.font.color.rgb = COLOR_DARK
    for r in (r_l1, r_l2):
        r.font.name = 'Calibri'
        r.font.size = Pt(8.8)

    add_bottom_border(p_licence, color_hex=HEX_RED, size="10")

    # Date & Details
    cl_spec = spec.get('coverLetter', {})
    now = datetime.datetime.now()
    default_date = now.strftime('%d %B %Y')
    if default_date.startswith('0'):
        default_date = default_date[1:]

    if isinstance(cl_spec, str):
        paragraphs = [scrub_ungrounded_terms(p.strip()) for p in cl_spec.split('\n\n') if p.strip()]
        date_str = default_date
        addressee = 'Hiring Team\n' + spec.get('company', '') + '\nWellington, New Zealand'
        greeting = 'Dear Hiring Team,'
        signoff = 'Sincerely,\nJordan Smith'
    else:
        # Cover letters should always carry the current generation date
        date_str = default_date
        addressee = cl_spec.get('addressee') or f"Hiring Team\n{spec.get('company', '')}\nWellington, New Zealand"
        greeting = cl_spec.get('greeting', 'Dear Hiring Team,')
        raw_p = cl_spec.get('paragraphs', [])
        paragraphs = [scrub_ungrounded_terms(p.strip()) for p in (raw_p if isinstance(raw_p, list) else str(raw_p).split('\n\n')) if p.strip()]
        signoff = cl_spec.get('signoff', 'Sincerely,\nJordan Smith')

    addressee = scrub_ungrounded_terms(addressee)
    greeting = scrub_ungrounded_terms(greeting)
    signoff = scrub_ungrounded_terms(signoff)

    # Hardcoded prohibition on Māori greetings and signoffs per user instruction
    if re.search(r'(t[eē]n[aā]|kia\s*ora)', greeting, re.I):
        greeting = 'Dear Hiring Team,'
    if re.search(r'ng[aā]\s*mihi', signoff, re.I):
        signoff = 'Sincerely,\nJordan Smith'

    add_p(doc, date_str, font_size=9.5, space_before=10.0, space_after=4.0)

    # Addressee
    p_rec = add_p(doc, space_after=10.0, line_spacing=1.12)
    p_rec.add_run(addressee)
    for r in p_rec.runs:
        r.font.name = 'Calibri'
        r.font.size = Pt(9.5)
        r.font.color.rgb = COLOR_BLACK

    # Strip duplicate greetings from paragraphs array if generated by LLM
    if paragraphs and re.match(r'^(kia\s*ora|dear|t[eē]n[aā]|hi\b)', paragraphs[0], re.I):
        p_g = paragraphs[0]
        paragraphs = paragraphs[1:]
        if not re.search(r'(t[eē]n[aā]|kia\s*ora)', p_g, re.I):
            greeting = p_g
        else:
            greeting = 'Dear Hiring Team,'

    # Strip duplicate signoffs from paragraphs array if generated by LLM
    if paragraphs and re.search(r'(ng[aā]\s*mihi|sincerely|regards|yours|jordan)', paragraphs[-1], re.I):
        p_s = paragraphs[-1]
        paragraphs = paragraphs[:-1]
        if not re.search(r'ng[aā]\s*mihi', p_s, re.I):
            signoff = p_s
        else:
            signoff = 'Sincerely,\nJordan Smith'

    # Greeting
    add_p(doc, greeting, font_size=9.8, bold=True, space_after=8.0)

    # Paragraphs
    for p_text in paragraphs:
        if p_text.strip():
            add_p(doc, p_text.strip(), font_size=9.5, space_after=8.0, line_spacing=1.15)

    # Signoff (Strictly English standard)
    signoff_lines = [l.strip() for l in signoff.split('\n') if l.strip()]
    if signoff_lines:
        add_p(doc, signoff_lines[0], font_size=9.5, space_before=6.0, space_after=2.0)
    for line in signoff_lines[1:]:
        add_p(doc, line, font_size=10.0, bold=True, color=COLOR_BLACK, space_after=0.0)

    os.makedirs(os.path.dirname(os.path.abspath(out_docx)), exist_ok=True)
    doc.save(out_docx)
    return out_docx

def convert_to_pdf(docx_path, out_dir):
    for cmd in ['libreoffice', 'soffice', '/usr/bin/libreoffice']:
        try:
            res = subprocess.run(
                [cmd, '--headless', '--convert-to', 'pdf', docx_path, '--outdir', out_dir],
                capture_output=True, text=True, timeout=60
            )
            if res.returncode == 0:
                base = os.path.splitext(os.path.basename(docx_path))[0]
                expected_pdf = os.path.join(out_dir, base + '.pdf')
                if os.path.exists(expected_pdf):
                    return expected_pdf
        except Exception:
            pass

    try:
        from docx2pdf import convert
        base = os.path.splitext(os.path.basename(docx_path))[0]
        expected_pdf = os.path.join(out_dir, base + '.pdf')
        convert(docx_path, expected_pdf)
        if os.path.exists(expected_pdf):
            return expected_pdf
    except Exception as e:
        print(f'Warning: PDF conversion fallback failed: {e}', file=sys.stderr)

    return None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, help='Path to JSON spec file')
    parser.add_argument('--convert-pdf', action='store_true', default=True, help='Convert CV to PDF')
    parser.add_argument('--verify', action='store_true', default=True, help='Run verify-docs.py on output folder')
    args = parser.parse_args()

    with open(args.input, 'r', encoding='utf-8') as f:
        spec = json.load(f)

    company = spec.get('company', 'Unknown')
    role = spec.get('role', 'Role')
    clean_company = sanitize_filename(company)
    clean_role = sanitize_filename(role)

    out_dir = spec.get('outputDir')
    if not out_dir:
        out_dir = os.path.join('Pending to Apply', clean_company)

    if not os.path.isabs(out_dir):
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        out_dir = os.path.join(project_root, out_dir)

    os.makedirs(out_dir, exist_ok=True)

    cv_filename = f'CV - {clean_company} - {clean_role}.docx'
    cl_filename = f'Cover Letter - {clean_company} - {clean_role}.docx'

    cv_docx = os.path.join(out_dir, cv_filename)
    cl_docx = os.path.join(out_dir, cl_filename)

    print(f'Generating CV DOCX -> {cv_docx}')
    generate_cv(spec, cv_docx)

    print(f'Generating Cover Letter DOCX -> {cl_docx}')
    generate_cover_letter(spec, cl_docx)

    cv_pdf = None
    cl_pdf = None
    if args.convert_pdf:
        print(f'Converting CV to PDF in {out_dir}...')
        cv_pdf = convert_to_pdf(cv_docx, out_dir)
        if cv_pdf:
            print(f'CV PDF generated successfully -> {cv_pdf}')
        else:
            print('Warning: CV PDF could not be generated', file=sys.stderr)

        print(f'Converting Cover Letter to PDF in {out_dir}...')
        cl_pdf = convert_to_pdf(cl_docx, out_dir)
        if cl_pdf:
            print(f'Cover Letter PDF generated successfully -> {cl_pdf}')
        else:
            print('Warning: Cover Letter PDF could not be generated', file=sys.stderr)

    if args.verify:
        verify_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify-docs.py')
        if os.path.exists(verify_script):
            print(f'Running verify-docs.py on {out_dir}...')
            v_res = subprocess.run(
                [sys.executable, verify_script, '--folder', out_dir],
                capture_output=True, text=True
            )
            print(v_res.stdout)
            if v_res.stderr:
                print(v_res.stderr, file=sys.stderr)
            if v_res.returncode != 0:
                print('Quality gate WARNING or FAILURE in verify-docs.py', file=sys.stderr)
                sys.exit(v_res.returncode)

    print(json.dumps({
        'ok': True,
        'folder': out_dir,
        'cvDocx': cv_docx,
        'cvPdf': cv_pdf,
        'clDocx': cl_docx,
        'clPdf': cl_pdf
    }))

if __name__ == '__main__':
    main()
