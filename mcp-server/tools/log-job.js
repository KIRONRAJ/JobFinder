import {
  cleanJobUrl,
  parseSeekHtml,
  parseTradeMeHtml,
  parseLinkedInHtml,
  parseGenericHtml,
} from '../../server/telegram-commands.js';

function determineFit(role = '', company = '') {
  const combined = `${role} ${company}`.toLowerCase();
  if (
    combined.includes('soc') ||
    combined.includes('security') ||
    combined.includes('cyber') ||
    combined.includes('linux') ||
    combined.includes('noc') ||
    combined.includes('network')
  ) {
    return 'strong';
  }
  if (
    combined.includes('grc') ||
    combined.includes('compliance') ||
    combined.includes('analyst') ||
    combined.includes('support') ||
    combined.includes('helpdesk') ||
    combined.includes('service desk') ||
    combined.includes('coordinator') ||
    combined.includes('data administrator')
  ) {
    return 'good';
  }
  return 'stretch';
}

export async function parseJobUrl(url, fetchImpl = fetch) {
  const cleanUrl = cleanJobUrl(url);
  let html = '';
  try {
    const res = await fetchImpl(cleanUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-NZ,en;q=0.9',
      },
    });
    if (res.ok) {
      html = await res.text();
    }
  } catch (err) {
    console.error(`Failed to fetch job URL ${cleanUrl}:`, err.message);
  }

  let parsed = { role: '', company: '', location: 'Wellington, NZ', url: cleanUrl };
  if (html) {
    const lower = cleanUrl.toLowerCase();
    if (lower.includes('seek.co') || lower.includes('seek.com')) {
      parsed = parseSeekHtml(html, cleanUrl);
    } else if (lower.includes('trademe.co.nz')) {
      parsed = parseTradeMeHtml(html, cleanUrl);
    } else if (lower.includes('linkedin.com')) {
      parsed = parseLinkedInHtml(html, cleanUrl);
    } else {
      parsed = parseGenericHtml(html, cleanUrl);
    }
  }

  return parsed;
}

export async function logJob({
  url,
  company,
  role,
  location,
  fit,
  status = 'researching',
  notes,
  apiBase,
  token,
  fetchImpl = fetch,
} = {}) {
  let finalCompany = company || '';
  let finalRole = role || '';
  let finalLocation = location || '';
  let finalLink = url ? cleanJobUrl(url) : '';
  let finalFit = fit || '';

  if (url && (!finalCompany || !finalRole)) {
    const parsed = await parseJobUrl(url, fetchImpl);
    if (!finalCompany && parsed.company) finalCompany = parsed.company;
    if (!finalRole && parsed.role) finalRole = parsed.role;
    if (!finalLocation && parsed.location) finalLocation = parsed.location;
    if (!finalLink && parsed.url) finalLink = parsed.url;
  }

  if (!finalCompany || !finalRole) {
    return {
      isError: true,
      text: `Could not determine Company and Role. Please provide company and role explicitly (e.g. company: "...", role: "...").`,
    };
  }

  if (!finalLocation) finalLocation = 'Wellington, NZ';
  if (!finalFit) finalFit = determineFit(finalRole, finalCompany);

  const payload = {
    company: finalCompany.trim(),
    role: finalRole.trim(),
    location: finalLocation.trim(),
    link: finalLink || '',
    fit: finalFit,
    status,
    notes: notes || '',
  };

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchImpl(`${apiBase}/api/applications`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      isError: true,
      text: `Failed to connect to JobHQ server on ${apiBase}: ${err.message}`,
    };
  }

  const resBody = await res.json().catch(() => ({}));

  if (res.status === 409) {
    return {
      isError: false,
      text: `ℹ️ Role is already in your JobHQ tracker:\n🏢 ${payload.company} — ${payload.role}\nNote: ${resBody.error || 'Duplicate detected.'}`,
    };
  }

  if (!res.ok) {
    return {
      isError: true,
      text: resBody.error || `Server responded with HTTP ${res.status}`,
    };
  }

  const created = resBody.entry || resBody;
  return {
    isError: false,
    text: [
      `✅ Successfully logged new application to JobSearchHQ!`,
      `🏢 Company: ${created.company}`,
      `💼 Role: ${created.role}`,
      `📍 Location: ${created.location}`,
      `🎯 Fit: ${created.fit}`,
      `🔄 Status: ${created.status}`,
      `🆔 ID: \`${created.id}\``,
      created.link ? `🔗 Link: ${created.link}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
