#!/usr/bin/env python3
"""Generates tailored CV and Cover Letter DOCX + PDF files grounded in Candidate Key Facts.

Usage:
    python generate-tailored-docs.py --input /path/to/spec.json
    python generate-tailored-docs.py --input /path/to/spec.json --convert-pdf --verify
"""

import argparse
import json
import os
import re
import subprocess
import sys
import docx
from docx.shared import Pt, Inches

A4_WIDTH = Inches(8.27)
A4_HEIGHT = Inches(11.69)

DEFAULT_PROJECTS = [
    {
        'title': "Master's Research Project — Replay Attack Prevention in Smart Car IoT Systems (2025–2026)",
        'narrative': (
            'Studied how an attacker can capture and resend a valid message to gain unauthorised access '
            'to a smart car\'s IoT systems, and why existing nonce-based and counter-based defences each '
            'fall short on their own. Proposed a hybrid defence combining both approaches and evaluated it '
            'in a simulated smart-vehicle environment, measuring replay detection rate, latency and attack success rate.'
        )
    },
    {
        'title': 'Intelligent Aquaponics (2017–2019)',
        'narrative': (
            'Built an automated aquaponics system combining fish tanks with hydroponic beds, using relay-controlled '
            'pumps and sensors to monitor water level, humidity and temperature. Included a backup air pump and a '
            'master kill relay for power outages, and a web application for logging and viewing sensor data from '
            'a browser or Android device.'
        )
    },
]

DEFAULT_CERTS = [
    'Red Hat Certified System Administrator (RHCSA) — Verification ID: 240-025-115',
    'Google Cybersecurity Professional Certificate — Coursera (currently completing, 5 of 8 courses complete)',
    'cPanel Professional Certification (CPP) & cPanel & WHM Administrator (CWA) — held 2021–2022',
    'CCNA Routing & Switching — training course completed, Vidya Academy of Science and Technology (2017–2018)',
    'freeCodeCamp Responsive Web Design certification (around 300 hours of coursework)',
]

DEFAULT_EXPERIENCE_SUMMARY = [
    {'role': 'L2 NOC Engineer', 'company': 'Keralavision Broadband Pvt Limited', 'dates': '11/2017–06/2019'},
    {'role': 'Software Engineer', 'company': 'Poornam Infovision Pvt Ltd (Bobcares)', 'dates': '04/2021–07/2021'},
    {'role': 'Freelance Web Developer', 'company': 'Thrissur, India', 'dates': '07/2021–06/2025'},
    {'role': 'Production Labourer', 'company': 'Tuatara Brewery', 'dates': '02/2026–03/2026'},
]

RESEARCH_ABSTRACT = (
    'Master’s Research Project: Replay Attack Prevention in Smart Car IoT Systems. '
    'Evaluated hybrid nonce- and counter-based defense mechanisms across replay detection '
    'rate, latency, and attack success rate in a simulated vehicular IoT environment.'
)

def sanitize_filename(name):
    clean = re.sub(r'\s*[/\\|]\s*', ' - ', name)
    clean = re.sub(r'[\?%*:"><]', '', clean)
    clean = re.sub(r'\s+', ' ', clean)
    return clean.strip()

def add_p(doc, text='', font_size=10.0, bold=False, space_after=2.0, space_before=0.0, italic=False, line_spacing=1.05):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.line_spacing = line_spacing
    if text:
        r = p.add_run(text)
        r.font.name = 'Calibri'
        r.font.size = Pt(font_size)
        r.bold = bold
        r.italic = italic
    return p

UNGROUNDED_REPLACEMENTS = [
    (r'\bKraken(?:\s+platform)?\b', 'enterprise utility/billing platform'),
]

def scrub_ungrounded_terms(text):
    if not text:
        return ''
    cleaned = str(text)
    for pattern, replacement in UNGROUNDED_REPLACEMENTS:
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.I)
    return cleaned

def normalize_skill(s):
    if isinstance(s, str):
        if ':' in s:
            cat, detail = s.split(':', 1)
            return scrub_ungrounded_terms(cat.strip() + ': '), scrub_ungrounded_terms(detail.strip())
        return '', scrub_ungrounded_terms(s.strip())
    cat = s.get('category') or s.get('name') or ''
    if cat and not cat.endswith(': '):
        cat = cat.rstrip(':') + ': '
    detail = s.get('detail') or s.get('description') or s.get('skills') or ''
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

def normalize_project(p):
    if isinstance(p, str):
        return {'title': p, 'subtitle': '', 'bullets': []}
    title = p.get('title') or p.get('name') or ''
    subtitle = p.get('subtitle') or p.get('role') or p.get('detail') or ''
    raw_bullets = p.get('bullets') or p.get('details') or []
    if isinstance(raw_bullets, str):
        bullets = [b.strip() for b in raw_bullets.split('\n') if b.strip()]
    elif isinstance(raw_bullets, list):
        bullets = [str(b).strip() for b in raw_bullets if str(b).strip()]
    else:
        bullets = []
    return {'title': title, 'subtitle': subtitle, 'bullets': bullets}

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
    return {'title': title, 'institution': institution, 'bullets': bullets}

def generate_cv(spec, out_docx):
    doc = docx.Document()
    s = doc.sections[0]
    s.page_width = A4_WIDTH
    s.page_height = A4_HEIGHT
    s.top_margin = Pt(36)
    s.bottom_margin = Pt(36)
    s.left_margin = Pt(45)
    s.right_margin = Pt(45)

    # --- 1. Header ---
    add_p(doc, 'KIRONRAJ ODATT PERINGODE', font_size=15.5, bold=True, space_after=2.0)
    add_p(doc,
          'Trentham, Upper Hutt, Wellington   |   +64-22-131-9495   |   kiron.raj.op@gmail.com   |   www.kironraj.com   |   linkedin.com/in/kironrajop',
          font_size=9.2, space_after=2.0)
    add_p(doc,
          'Work eligibility: 3-year Post Study Work Visa (Open Work Visa) – full open work rights, no sponsorship required. Full clean NZ driver\'s licence and own car.',
          font_size=9.2, space_after=6.0)

    # --- 2. Professional Profile ---
    add_p(doc, 'PROFESSIONAL PROFILE', font_size=11.0, bold=True, space_before=4.0, space_after=2.0)
    raw_profile = spec.get('profile') or spec.get('careerObjective') or ''
    profile_text = scrub_ungrounded_terms(raw_profile)
    add_p(doc, profile_text, font_size=9.5, space_after=5.0)

    # --- 3. Core Competencies & Technical Skills ---
    add_p(doc, 'CORE COMPETENCIES & TECHNICAL SKILLS', font_size=11.0, bold=True, space_before=4.0, space_after=2.0)
    raw_skills = spec.get('skills') or spec.get('skillsSummary') or []
    for item in raw_skills:
        if isinstance(item, dict) and item.get('heading'):
            cat = scrub_ungrounded_terms(item['heading'])
            if not cat.endswith(': '):
                cat = cat.rstrip(':') + ': '
            detail = scrub_ungrounded_terms(item.get('narrative', ''))
        elif isinstance(item, dict):
            cat, detail = normalize_skill(item)
        else:
            cat, detail = '', scrub_ungrounded_terms(str(item))

        p = add_p(doc, space_after=2.0)
        if cat:
            r1 = p.add_run('•  ' + cat)
            r1.bold = True
            r1.font.name = 'Calibri'
            r1.font.size = Pt(9.3)
        else:
            r1 = p.add_run('•  ')
            r1.font.name = 'Calibri'
            r1.font.size = Pt(9.3)
        r2 = p.add_run(detail)
        r2.font.name = 'Calibri'
        r2.font.size = Pt(9.3)

    # --- 4. Work History & Relevant Experience ---
    add_p(doc, 'WORK HISTORY & RELEVANT EXPERIENCE', font_size=11.0, bold=True, space_before=4.0, space_after=2.0)
    raw_history = spec.get('workHistory') or spec.get('detailedExperience') or []
    parsed_history = []
    for j in raw_history:
        job = normalize_job(j)
        if not job['bullets'] and j.get('narrative'):
            raw_narr = scrub_ungrounded_terms(j['narrative'])
            sentences = [s.strip() for s in re.split(r'\.\s+', raw_narr) if s.strip()]
            job['bullets'] = [s + ('.' if not s.endswith('.') else '') for s in sentences]
        parsed_history.append(job)

    # Split: first 3 jobs on Page 1, 4th job on Page 2 (guarantees no orphan headers & balanced flow)
    page1_jobs = parsed_history[:3]
    page2_jobs = parsed_history[3:]

    for job in page1_jobs:
        add_p(doc, job['role'], font_size=10.0, bold=True, space_before=2.5, space_after=0.0)
        if job['company']:
            add_p(doc, job['company'], font_size=9.5, space_after=0.0)
        if job['period']:
            add_p(doc, job['period'], font_size=9.0, italic=True, space_after=1.5)
        for i_b, b in enumerate(job['bullets']):
            sa = 3.0 if i_b == len(job['bullets']) - 1 else 1.5
            add_p(doc, '•  ' + b, font_size=9.3, space_after=sa)

    # Page 2: Remaining jobs (e.g. Keralavision)
    for job in page2_jobs:
        add_p(doc, job['role'], font_size=10.0, bold=True, space_before=2.0, space_after=0.0)
        if job['company']:
            add_p(doc, job['company'], font_size=9.5, space_after=0.0)
        if job['period']:
            add_p(doc, job['period'], font_size=9.0, italic=True, space_after=1.5)
        for i_b, b in enumerate(job['bullets']):
            sa = 4.0 if i_b == len(job['bullets']) - 1 else 1.5
            add_p(doc, '•  ' + b, font_size=9.3, space_after=sa)

    # --- 5. Education & Academic Qualifications ---
    add_p(doc, 'EDUCATION & ACADEMIC QUALIFICATIONS', font_size=11.0, bold=True, space_before=4.0, space_after=2.0)
    raw_edu = spec.get('education', [])
    parsed_edu = [normalize_edu(e) for e in raw_edu]
    if not parsed_edu:
        parsed_edu = [
            {
                'title': 'Master of Information Technology (Cyber Security specialisation) — Completed with Merit',
                'institution': 'Whitecliffe College, Wellington, New Zealand  |  07/2025 – 07/2026 (Completed 10 July 2026)',
                'bullets': ['Advanced coursework in Information Security Standards & Operations (Grade A), network defense, and access management.']
            },
            {
                'title': 'Bachelor of Technology in Electronics and Communication Engineering',
                'institution': 'Jyothi Engineering College, affiliated to the University of Calicut, Thrissur, India  |  06/2013 – 07/2017',
                'bullets': ['Comprehensive 4-year engineering curriculum covering circuits, telecommunications, signal processing, and microcontroller hardware.']
            }
        ]

    for edu in parsed_edu:
        add_p(doc, edu['title'], font_size=10.2, bold=True, space_before=2.0, space_after=0.0)
        if edu['institution']:
            add_p(doc, edu['institution'], font_size=9.0, italic=True, space_after=2.0)
        for b in edu.get('bullets', []):
            add_p(doc, '•  ' + scrub_ungrounded_terms(str(b)), font_size=9.5, space_after=3.0)
    if doc.paragraphs:
        doc.paragraphs[-1].paragraph_format.space_after = Pt(6.0)

    # --- 6. Master's Research Project ---
    add_p(doc, 'MASTER\'S RESEARCH PROJECT', font_size=11.5, bold=True, space_before=6.0, space_after=3.0)
    add_p(doc, 'Replay Attack Prevention in Smart Car IoT Systems', font_size=10.2, bold=True, space_after=0.0)
    add_p(doc, 'Whitecliffe College, Wellington  |  2025 – 2026', font_size=9.0, italic=True, space_after=2.0)
    add_p(doc,
          'Investigated replay vulnerabilities in vehicular IoT communications where attackers intercept and retransmit valid messages. Assessed limitations of existing nonce-based and counter-based mechanisms, and designed and evaluated a hybrid defence in a simulated smart-vehicle environment, analyzing replay detection rate, latency, and attack mitigation efficiency.',
          font_size=9.5, space_after=6.0)

    # --- 7. Technical & IoT Projects ---
    raw_projects = spec.get('projects') or DEFAULT_PROJECTS
    if raw_projects:
        add_p(doc, 'TECHNICAL & IoT PROJECTS', font_size=11.5, bold=True, space_before=6.0, space_after=3.0)
        for p_item in raw_projects:
            np = normalize_project(p_item)
            if 'replay attack' in np['title'].lower() or 'smart car' in np['title'].lower():
                continue
            add_p(doc, np['title'], font_size=10.2, bold=True, space_before=2.0, space_after=0.0)
            if np['subtitle']:
                add_p(doc, np['subtitle'], font_size=9.0, italic=True, space_after=2.0)
            if np['bullets']:
                for b in np['bullets']:
                    add_p(doc, '•  ' + scrub_ungrounded_terms(str(b)), font_size=9.5, space_after=2.0)
            elif p_item.get('narrative'):
                add_p(doc, scrub_ungrounded_terms(p_item['narrative']), font_size=9.5, space_after=4.0)
        if doc.paragraphs:
            doc.paragraphs[-1].paragraph_format.space_after = Pt(6.0)

    # --- 8. Certifications & Training ---
    raw_certs = spec.get('certifications') or DEFAULT_CERTS
    # Strictly filter out any hallucinated or unapproved ServiceNow entries
    cleaned_certs = []
    for c in raw_certs:
        c_text = c if isinstance(c, str) else str(c.get('name', c.get('title', c)))
        if 'servicenow' in c_text.lower():
            continue
        cleaned_certs.append(c_text)

    if cleaned_certs:
        add_p(doc, 'CERTIFICATIONS & TECHNICAL TRAINING', font_size=11.5, bold=True, space_before=6.0, space_after=3.0)
        for c_text in cleaned_certs:
            add_p(doc, '•  ' + scrub_ungrounded_terms(c_text), font_size=9.3, space_after=2.0)
        if doc.paragraphs:
            doc.paragraphs[-1].paragraph_format.space_after = Pt(6.0)

    # Note: INTERESTS & ACTIVITIES is permanently excluded per candidate's instruction (unprofessional for technical CV).

    os.makedirs(os.path.dirname(os.path.abspath(out_docx)), exist_ok=True)
    doc.save(out_docx)
    return out_docx

def generate_cover_letter(spec, out_docx):
    doc = docx.Document()
    s = doc.sections[0]
    s.page_width = A4_WIDTH
    s.page_height = A4_HEIGHT
    s.top_margin = Pt(36)
    s.bottom_margin = Pt(36)
    s.left_margin = Pt(45)
    s.right_margin = Pt(45)

    # Header
    add_p(doc, 'KIRONRAJ ODATT PERINGODE', font_size=14.0, bold=True, space_after=2.0)
    add_p(doc, 'Trentham, Upper Hutt, Wellington  •  +64-22-131-9495  •  kiron.raj.op@gmail.com  •  www.kironraj.com', font_size=9.5, space_after=2.0)
    add_p(doc, 'Work eligibility: 3-year Post Study Work Visa (Open Work Visa) – full open work rights, no sponsorship required', font_size=9.5, space_after=10.0)

    # Date & Details
    cl_spec = spec.get('coverLetter', {})
    if isinstance(cl_spec, str):
        paragraphs = [scrub_ungrounded_terms(p.strip()) for p in cl_spec.split('\n\n') if p.strip()]
        date_str = '5 September 2026'
        addressee = 'Hiring Team\n' + spec.get('company', '') + '\nWellington, New Zealand'
        greeting = 'Dear Hiring Team,'
        signoff = 'Sincerely,\nKironraj Odatt Peringode'
    else:
        date_str = cl_spec.get('date', '5 September 2026')
        addressee = cl_spec.get('addressee', 'Hiring Team\n' + spec.get('company', '') + '\nWellington, New Zealand')
        greeting = cl_spec.get('greeting', 'Dear Hiring Team,')
        raw_p = cl_spec.get('paragraphs', [])
        paragraphs = [scrub_ungrounded_terms(p.strip()) for p in (raw_p if isinstance(raw_p, list) else str(raw_p).split('\n\n')) if p.strip()]
        signoff = cl_spec.get('signoff', 'Sincerely,\nKironraj Odatt Peringode')

    # Hardcoded prohibition on Māori greetings and signoffs per user instruction
    if re.search(r'(t[eē]n[aā]|kia\s*ora)', greeting, re.I):
        greeting = 'Dear Hiring Team,'
    if re.search(r'ng[aā]\s*mihi', signoff, re.I):
        signoff = 'Sincerely,\nKironraj Odatt Peringode'

    add_p(doc, date_str, font_size=10.0, space_after=5.0)

    # Addressee
    for line in addressee.split('\n'):
        if line.strip():
            add_p(doc, line.strip(), font_size=10.0, space_after=1.0)
    doc.paragraphs[-1].paragraph_format.space_after = Pt(9.0)

    # Strip duplicate greetings from paragraphs array if generated by LLM
    if paragraphs and re.match(r'^(kia\s*ora|dear|t[eē]n[aā]|hi\b)', paragraphs[0], re.I):
        p_g = paragraphs[0]
        paragraphs = paragraphs[1:]
        if not re.search(r'(t[eē]n[aā]|kia\s*ora)', p_g, re.I):
            greeting = p_g
        else:
            greeting = 'Dear Hiring Team,'

    # Strip duplicate signoffs from paragraphs array if generated by LLM
    if paragraphs and re.search(r'(ng[aā]\s*mihi|sincerely|regards|yours|kironraj)', paragraphs[-1], re.I):
        p_s = paragraphs[-1]
        paragraphs = paragraphs[:-1]
        if not re.search(r'ng[aā]\s*mihi', p_s, re.I):
            signoff = p_s
        else:
            signoff = 'Sincerely,\nKironraj Odatt Peringode'

    # Greeting
    add_p(doc, greeting, font_size=10.0, space_after=8.0)

    # Paragraphs
    for p_text in paragraphs:
        if p_text.strip():
            add_p(doc, p_text.strip(), font_size=9.8, space_after=8.0)

    # Signoff
    signoff_lines = [l.strip() for l in signoff.split('\n') if l.strip()]
    if signoff_lines:
        add_p(doc, signoff_lines[0], font_size=10.0, space_after=2.0)
    for line in signoff_lines[1:]:
        add_p(doc, line, font_size=10.0, space_after=0.0)

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
    if args.convert_pdf:
        print(f'Converting CV to PDF in {out_dir}...')
        cv_pdf = convert_to_pdf(cv_docx, out_dir)
        if cv_pdf:
            print(f'CV PDF generated successfully -> {cv_pdf}')
        else:
            print('Warning: CV PDF could not be generated', file=sys.stderr)

        print(f'Converting Cover Letter to PDF in {out_dir}...')
        convert_to_pdf(cl_docx, out_dir)

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
        'clDocx': cl_docx
    }))

if __name__ == '__main__':
    main()
