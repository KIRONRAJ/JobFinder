import { canonicalise } from './market';
import type { Application } from '../types';
import type { DiagramKey } from '../components/ConceptDiagram';

/**
 * The Role Refreshers glossary.
 *
 * Purpose is narrow and worth stating, because it is easy to let this drift
 * into "a second Skill Guides pack": the guides teach a topic over a day, this
 * refreshes a term in ninety seconds, on the way into an interview, for a role
 * that is already applied for. So every entry is three short fields, never an
 * essay:
 *
 *  - `what`     one plain-English sentence. No jargon defined with more jargon.
 *  - `why`      why an employer puts it in an ad — the "so what".
 *  - `sayThis`  a sentence that is actually speakable out loud in an interview.
 *
 * `sayThis` is deliberately framed as honest-if-thin: several of these are
 * concepts Jordan knows academically rather than from a production role, and
 * a line that oversells is worse than no line. Where that applies the wording
 * says "conceptually" or "from study" rather than implying work history —
 * same honesty standard the CV and evidence-map already hold to.
 *
 * `diagram` is optional on purpose. A term only gets one when the concept is
 * genuinely spatial; see the note at the top of ConceptDiagram.tsx.
 */
export interface Refresher {
  what: string;
  why: string;
  sayThis: string;
  diagram?: DiagramKey;
  /** Extra ad-wordings that should resolve to this entry, beyond whatever
   *  `canonicalise()` in market.ts already folds together. Lowercase. */
  aliases?: string[];
}

export const REFRESHERS: Record<string, Refresher> = {
  Networking: {
    what: 'How devices find and talk to each other — addressing, routing, and the layers a packet passes through on the way.',
    why: 'Almost every infrastructure and security role assumes it. It is the shared vocabulary the rest of the interview is conducted in.',
    sayThis:
      'I worked layer-2 and layer-3 issues daily as an L2 NOC engineer on a 24/7 roster — routing, switching and escalation against SLAs, backed by CCNA.',
    diagram: 'osi',
    aliases: ['tcp/ip', 'network fundamentals', 'osi model', 'routing and switching', 'lan/wan'],
  },
  'Subnetting / IP addressing': {
    what: 'Splitting an IP range into smaller networks by moving the boundary between the network part and the host part of the address.',
    why: 'It is the standard whiteboard question for infrastructure roles, and it is quick to check — which is exactly why it gets asked.',
    sayThis:
      'Comfortable with CIDR maths — a /24 gives 254 usable hosts, a /30 gives 2 for a point-to-point link. I used this routinely on ISP network segments.',
    diagram: 'subnet',
    aliases: ['subnetting', 'ip addressing', 'cidr', 'subnet mask'],
  },
  DNS: {
    what: 'The system that turns a name like example.co.nz into an IP address, using a chain of caches and referrals.',
    why: 'A huge share of "the site is down" tickets are DNS. Interviewers use it to test whether you troubleshoot in a structured order.',
    sayThis:
      'My first checks are client cache, then resolver reachability, then whether the authoritative record is actually correct — most of the time the answer is a stale cache or a TTL not yet expired.',
    diagram: 'dns',
    aliases: ['dns', 'domain name system', 'name resolution'],
  },
  'Network segmentation': {
    what: 'Splitting a network into zones with controlled boundaries, so a compromise in one zone cannot reach another in a single hop.',
    why: 'Critical for utilities, health and anyone running OT alongside corporate IT — it is the main structural control that limits blast radius.',
    sayThis:
      'I understand the corporate / DMZ / OT split conceptually and why traffic terminates in the DMZ rather than crossing straight through — my hands-on network experience is ISP and hosting rather than OT, so I would be learning the operational side.',
    diagram: 'segmentation',
    aliases: ['segmentation', 'network segregation', 'zoning', 'ot/it segmentation', 'dmz'],
  },
  'CIA triad': {
    what: 'Confidentiality, integrity, availability — the three properties every security control is ultimately protecting.',
    why: 'It is the framework interviewers expect you to reason with when asked "how would you prioritise protecting this?"',
    sayThis:
      'I frame it by asking which corner the asset actually needs most — in a control system integrity and availability usually outrank confidentiality, which is the opposite of a typical corporate data set.',
    diagram: 'cia',
    aliases: ['cia triad', 'confidentiality integrity availability', 'security fundamentals'],
  },
  'Encryption / PKI': {
    what: 'Using key pairs and certificates so two parties can prove who they are and exchange data nobody in the middle can read.',
    why: 'Certificates expire, chains break, and someone has to understand the error message. It is operational, not just theoretical.',
    sayThis:
      'Covered in my Master\'s security papers and I understand the chain-of-trust model — "certificate not trusted" is usually a missing intermediate rather than a bad server certificate.',
    diagram: 'pki',
    aliases: ['encryption', 'pki', 'tls', 'ssl', 'certificates', 'certificate authority', 'cryptography'],
  },
  SIEM: {
    what: 'A platform that centralises logs from everywhere, normalises them, and correlates across sources to raise alerts.',
    why: 'It is the core tool of a SOC. Ads name a specific product, but the reasoning transfers between Splunk, Sentinel and the rest.',
    sayThis:
      'I understand the pipeline — sources, normalisation, correlation, alert, triage — and that most of the real work is tuning so analysts see actionable alerts rather than noise. My hands-on exposure is from self-directed study, not a SOC role yet.',
    diagram: 'siem',
    aliases: ['siem', 'splunk', 'sentinel', 'qradar', 'wazuh', 'elk stack', 'log management'],
  },
  'Incident response': {
    what: 'The structured lifecycle for handling a security incident: prepare, identify, contain, eradicate, recover, learn.',
    why: 'Employers want to know you will act in a defined order under pressure rather than improvising.',
    sayThis:
      'I ran incident handling to SLA in a NOC context — identify, contain, escalate correctly, document for handover. The security-specific eradication and forensics phases I know from study rather than from a live breach.',
    diagram: 'incident',
    aliases: [
      'incident response',
      'incident management',
      'ir',
      'incident handling',
      'incident and request resolution',
      'escalation',
      'incident-sla',
    ],
  },
  'SOC operations': {
    what: 'The day-to-day of a security operations centre — monitoring queues, triaging alerts, escalating true positives, on a roster.',
    why: 'It is a shift-work discipline as much as a technical one; employers check you have actually done rostered operational work.',
    sayThis:
      'The rhythm is familiar from my 24/7 NOC roster — queue discipline, escalation paths, shift handover notes. The alert content would be security rather than network, but the operating model is the same.',
    aliases: ['soc', 'security operations centre', 'security operations center', 'soc analyst'],
  },
  'Active Directory': {
    what: "Microsoft's on-premises directory: the authoritative list of users, computers and groups, and what each is allowed to do.",
    why: 'It is still the backbone of identity in most NZ organisations, and the first thing an attacker goes after.',
    sayThis:
      'Familiar with users, groups, OUs and group policy, and with why privileged group membership is the thing to watch — mostly from study and lab work rather than administering a production forest.',
    aliases: ['active directory', 'ad ds', 'windows ad', 'group policy', 'gpo'],
  },
  'Entra ID': {
    what: "Microsoft's cloud identity service (formerly Azure AD) — sign-in, MFA, and conditional access for cloud apps.",
    why: 'Most organisations now run hybrid identity, so ads pair it with Active Directory almost every time.',
    sayThis:
      'I understand the hybrid picture — on-prem AD synced to Entra, with conditional access as the policy layer deciding who gets in from where.',
    aliases: ['entra', 'entra id', 'azure ad', 'azure active directory', 'aad', 'conditional access'],
  },
  'ITIL / ITSM': {
    what: 'A common vocabulary for running IT as a service: incidents, problems, changes, and the difference between them.',
    why: 'Ads use it as shorthand for "you have worked somewhere with real process", not as a demand for the certificate.',
    sayThis:
      'I worked to ITSM practice in both operational roles — incident versus problem versus change is a distinction I used daily, particularly around change windows.',
    aliases: ['itil', 'itsm', 'it service management', 'itil v4', 'change management'],
  },
  Linux: {
    what: 'The operating system running most servers — administered from the command line rather than a GUI.',
    why: 'Infrastructure roles assume you can navigate, read logs and diagnose a service without a desktop.',
    sayThis:
      'I administered Linux servers at Cascade Infovision — services, logs, permissions, control panels on VPS and dedicated hosts — with strong Red Hat and Debian/Ubuntu Linux administration experience.',
    aliases: ['linux', 'rhel', 'red hat', 'ubuntu', 'unix/linux', 'linux administration'],
  },
  'Windows Server': {
    what: "Microsoft's server operating system, and the roles it hosts — file, print, directory, and application services.",
    why: 'Most NZ organisations run a mixed estate, so both sides of the fence get asked about.',
    sayThis:
      'Comfortable across both — at Cascade my work was on remote Windows and Linux VPS estates plus shared WordPress hosting, reached over VNC, so the mixed estate was the normal day rather than the exception.',
    aliases: ['windows server', 'windows administration', 'windows'],
  },
  'L1 / L2 / L3 support tiers': {
    what: 'How a support org splits work: L1 takes first contact and resolves the known and routine, L2 does the deeper diagnosis with more access, L3 is engineering or vendor level.',
    why: 'Ads use these labels loosely, so interviewers ask to find out what you actually did at each tier rather than what your title said.',
    sayThis:
      'My NOC role was explicitly the L2 tier — I took escalations from L1, did in-call troubleshooting with both L1 and L3, and escalated onward myself with a written diagnosis rather than just passing the ticket up.',
    aliases: [
      'level 1',
      'level 2',
      'l1',
      'l2',
      'tier 1',
      'tier 2',
      'first point of contact',
      'escalation to senior',
    ],
  },
  'Vulnerability management': {
    what: 'Scanning systems for known weaknesses, scoring them by severity, and driving them to be fixed on a schedule.',
    why: 'It is one of the most common entry points into a security team, because it is continuous and measurable.',
    sayThis:
      'I understand the loop — scan, prioritise by CVSS and real exposure rather than raw count, assign, verify the fix. The prioritisation conversation matters more than the scanner.',
    aliases: ['vulnerability management', 'vulnerability scanning', 'nessus', 'cvss', 'openvas', 'patching'],
  },
  EDR: {
    what: 'Endpoint detection and response — an agent on every laptop and server that records behaviour and can isolate the machine.',
    why: 'It replaced signature antivirus as the frontline control, and someone has to triage what it flags.',
    sayThis:
      'The distinction I would draw is that antivirus asks "is this file known bad" while EDR asks "is this behaviour suspicious" — and it gives you the ability to isolate a host remotely.',
    aliases: ['edr', 'endpoint detection', 'crowdstrike', 'defender for endpoint', 'xdr'],
  },
  'Firewall / edge': {
    what: 'The device enforcing what traffic may cross a network boundary, by rule.',
    why: 'Rule review and change requests are steady operational work in any infrastructure team.',
    sayThis:
      'I worked with firewall rules and edge configuration in an ISP environment — including why a rule set accumulates cruft and needs periodic review.',
    aliases: ['firewall', 'firewalls', 'fortinet', 'palo alto', 'edge security', 'acl'],
  },
  'Ticketing / service desk': {
    what: 'The queue where work arrives, gets prioritised, worked and documented.',
    why: 'It is the visible record of whether you communicate and close things out — employers check for it explicitly, and it is the most-requested keyword across your live applications.',
    sayThis:
      'Both my operational roles ran entirely through ticket queues. At Northline I worked an ISP ticketing platform as the L2 tier — taking escalations from L1, doing in-call troubleshooting with L1 and L3, and raising and chasing tickets with the major leased-line carriers, Jio, Airtel, Vodafone and Powertel, until they closed.',
    aliases: [
      'service desk',
      'help desk',
      'helpdesk',
      'ticketing',
      'ticket handling',
      'ticket logging',
      'ticket lifecycle',
      'case handling',
    ],
  },
  // Deliberately NOT an alias of "Ticketing / service desk". Folding them
  // together made a named-platform gap ("ServiceNow, certified/production
  // experience") paint the general ticketing term as a gap — telling Jordan
  // to revise the one part of this area he is genuinely strong in. The queue
  // discipline and the specific product are different claims.
  'ITSM platforms (ServiceNow / Jira)': {
    what: 'The enterprise products service desks actually run on — queues, request catalogues, CMDB, knowledge base and workflow automation in one platform.',
    why: 'Shops standardised on one of these want either hands-on time or clear evidence you will pick it up fast. It is a platform, not just a ticket form, so the learning curve is real.',
    sayThis:
      'The platform is the gap, not the work. I am partway through ServiceNow\'s own training — three badges so far, not a completed track — and I have not used it or Jira Service Management in production. What I do bring is the queue discipline underneath it, from two roles run entirely on ticketing systems.',
    aliases: ['servicenow', 'service-now', 'jira', 'jira service management', 'atlassian', 'itsm tool'],
  },
  'Vendor / carrier escalation': {
    what: 'Driving a fault that sits inside someone else\'s network or product — raising it with the supplier, chasing it against their SLA, and keeping your own customer informed while you wait.',
    why: 'It is the part of support you cannot fix yourself, so it tests persistence and communication rather than technical depth. Few service-desk candidates have done it with named carriers.',
    sayThis:
      'At Northline I raised and followed up leased-line faults directly with Jio, Airtel, Vodafone and Powertel. The lesson was that the ticket does not close itself — you chase it on their SLA and keep your own customer updated while it sits with the vendor.',
    aliases: ['vendor escalation', 'carrier', 'leased line', 'third-party escalation', 'supplier management'],
  },
  'Remote support tooling': {
    what: 'Taking control of, or shelling into, a machine you are not sitting at — remote-desktop tools for end users, VNC/SSH and consoles for servers.',
    why: 'Remote-first support is now the default, and employers want to know you can diagnose without being able to look over someone\'s shoulder.',
    sayThis:
      'I supported customers and operators over AnyDesk and TeamViewer at Northline, and at Cascade the whole role was remote — VNC into Windows and Linux VPS estates and shared WordPress hosting, with client contact over Teams and Slack.',
    aliases: [
      'remote support',
      'anydesk',
      'teamviewer',
      'vnc',
      'remote desktop',
      'remote access',
      'rdp',
    ],
  },
  Python: {
    what: 'A general-purpose scripting language, used in operations for automation and quick data work.',
    why: 'Ads list it to mean "can you automate the repetitive part", not "can you build a product".',
    sayThis:
      'I have used Python and Django on project work. I would describe it as competent scripting rather than software-engineering depth.',
    aliases: ['python', 'python scripting', 'django'],
  },
  PowerShell: {
    what: "Windows' scripting language, and the standard way to administer Microsoft estates at scale.",
    why: 'Any bulk change in a Microsoft environment is a PowerShell change.',
    sayThis:
      'I can read and adapt PowerShell for administrative tasks. Writing complex modules from scratch would be a growth area.',
    aliases: ['powershell', 'ps scripting'],
  },
  SQL: {
    what: 'The query language for relational databases — selecting, filtering and joining rows across tables.',
    why: 'Any role with "data" in the title assumes you can pull your own answers rather than asking someone else.',
    sayThis:
      "Honest answer: it is not on my CV as professional experience. I know SELECT, WHERE and JOIN at a self-taught level and I'd rather say that than overstate it.",
    aliases: ['sql', 'database querying', 'structured data querying', 't-sql'],
  },
  'Data visualisation / BI': {
    what: 'Turning query results into charts and dashboards other people can act on — Power BI, Excel, similar.',
    why: 'Reporting is often half of an analyst role, and it is the half candidates forget to prepare for.',
    sayThis:
      'Not an evidenced strength. I would name it as a gap and point to the fact that I built and maintain my own tracking dashboard as evidence I take to it quickly.',
    aliases: ['power bi', 'data visualisation', 'data visualization', 'reporting', 'dashboards', 'excel'],
  },
  Docker: {
    what: 'Packaging an application with its dependencies into a container that runs the same anywhere.',
    why: 'It is now assumed background for infrastructure work, even in shops that are not fully containerised.',
    sayThis:
      'I understand images, containers and why the isolation matters. Production container operations would be a genuine learning curve.',
    aliases: ['docker', 'containers', 'containerisation', 'podman'],
  },
  Kubernetes: {
    what: 'The orchestrator that schedules and keeps containers running across a fleet of machines.',
    why: 'Ads list it alongside Docker; the honest bar for a junior role is understanding, not operating.',
    sayThis:
      'Conceptual understanding — pods, deployments, services. I would not claim operational Kubernetes experience.',
    aliases: ['kubernetes', 'k8s', 'openshift'],
  },
  Azure: {
    what: "Microsoft's cloud platform — virtual machines, identity, networking and services rented rather than owned.",
    why: 'Most NZ organisations are Microsoft-first, so Azure appears in the majority of infrastructure ads.',
    sayThis:
      'Cloud fundamentals are solid conceptually and I hold CCNA Cloud; my hands-on hosting experience is traditional VPS and dedicated servers rather than Azure specifically.',
    aliases: ['azure', 'microsoft azure'],
  },
  AWS: {
    what: "Amazon's cloud platform — the other major provider, with its own names for the same building blocks.",
    why: 'Listed where the organisation is not Microsoft-first; the concepts transfer directly from Azure.',
    sayThis:
      'The building blocks map across — compute, storage, IAM, VPC. I would be transferring understanding rather than starting cold.',
    aliases: ['aws', 'amazon web services', 'ec2', 's3'],
  },
  'Microsoft 365': {
    what: "The hosted Office suite plus its admin surface — Exchange Online, SharePoint, Teams and their security settings.",
    why: 'It is where most organisations\' data actually lives, so it is where most support tickets and most phishing land.',
    sayThis:
      'Familiar as an administrator-adjacent user — mailbox, licensing and sharing settings are the areas I would expect to work in first.',
    aliases: ['m365', 'office 365', 'o365', 'microsoft 365', 'exchange online', 'sharepoint'],
  },
  'Risk assessment': {
    what: 'Judging how likely a threat is and how badly it would hurt, then deciding whether to treat, tolerate or transfer it.',
    why: 'Core to GRC and compliance roles, and it is the language management actually makes decisions in.',
    sayThis:
      'Covered in my Information Security Standards and Operations paper — the part I would emphasise is that a risk register is only useful if someone owns each line and it gets revisited.',
    aliases: ['risk assessment', 'risk management', 'grc', 'risk register', 'compliance'],
  },
  'Security frameworks': {
    what: 'Published control sets — ISO 27001, NIST CSF, the NZISM locally — that define what good looks like.',
    why: 'NZ government and critical-infrastructure employers work to NZISM specifically; naming it shows local awareness.',
    sayThis:
      'I know the ISO 27001 and NIST structures from study, and I am aware NZISM is the standard that applies in the New Zealand government context specifically.',
    aliases: ['iso 27001', 'nist', 'nzism', 'security frameworks', 'controls framework', 'cis controls'],
  },
  'On-call / shift work': {
    what: 'Rostered coverage outside business hours, with defined escalation and handover.',
    why: 'Ads flag it because it is the most common reason a good candidate declines an offer — they want it acknowledged up front.',
    sayThis:
      'I have worked a genuine 24/7 rotating roster before and I am comfortable with it — including the handover discipline that makes the next shift effective.',
    aliases: ['on-call', 'on call', 'shift work', 'rostered', '24/7', 'after hours'],
  },
  'Stakeholder communication': {
    what: 'Explaining technical work to people who do not share your vocabulary, and adjusting the level as you go.',
    why: 'It is the most commonly cited reason technical hires struggle, so it is deliberately probed.',
    sayThis:
      'Both operational roles were customer-facing under pressure — explaining an outage to someone who wants a time estimate, not a root-cause analysis.',
    aliases: [
      'stakeholder management',
      'communication',
      'communication skills',
      'clear communication',
      'customer service',
      'stakeholder engagement',
      'customer-facing technical support',
    ],
  },
  'Google Workspace for Education / Google Admin': {
    what: "Google's cloud ecosystem for schools — user directory, Organisational Unit (OU) policy trees, force-installed extensions, and Chromebook device fleet settings.",
    why: 'Secondary schools in NZ run predominantly on Google Workspace; interviewers check if you know where to look in admin.google.com and how policy inheritance works.',
    sayThis:
      'I understand OU policy inheritance, restriction policies like blocking incognito and personal Gmail sign-in, zero-touch and manual enterprise enrollment, and using Alt+V for instant lock-screen hardware diagnostics.',
    aliases: [
      'google workspace',
      'google admin',
      'google admin console',
      'google workspace for education',
      'g suite',
      'chromebook ou',
      'google ou',
      'google policy management',
      'chromebook provisioning',
      'enterprise enrollment',
    ],
  },
  'Chromebook Fleet Triage': {
    what: 'The rapid diagnostic sequence for ChromeOS devices — lock screen shortcuts, hardware embedded controller resets, powerwashing, and OS recovery USBs.',
    why: 'With hundreds of students carrying devices, technicians must isolate whether a fault is user profile corruption, battery cutoff, or physical hardware in under 60 seconds.',
    sayThis:
      'My first step is Alt+V at the sign-in screen to check OS version, serial number and Wi-Fi IP. For unresponsive hardware I do a Refresh+Power embedded controller reset, for profile bugs a Ctrl+Alt+Shift+R powerwash, and I keep a pre-imaged ChromeOS recovery USB in my toolkit.',
    aliases: [
      'chromebook',
      'chromebooks',
      'chromebook fleet',
      'chromeos',
      'powerwash',
      'chromebook triage',
      'chromebook repair',
      'chromebook troubleshooting',
    ],
  },
  'Enterprise Wi-Fi (802.1X)': {
    what: 'Enterprise wireless security where each user or device authenticates individually via PEAP or EAP-TLS against a RADIUS server, rather than sharing a single password.',
    why: 'Pre-shared keys leak across schools immediately; 802.1X is how student and staff traffic is isolated and authenticated, and certificate expiry is a common campus-wide failure mode.',
    sayThis:
      'I understand how Google Admin pushes Wi-Fi network profiles and trusted internal Root CA certificates to enrolled Chromebooks, and that a sudden campus-wide connection failure is usually an expired internal CA certificate or a RADIUS service timeout.',
    aliases: [
      '802.1x',
      'enterprise wi-fi',
      'enterprise wifi',
      'radius',
      'wpa2 enterprise',
      'eap-tls',
      'peap',
      'wi-fi certificate',
      'certificate distribution',
    ],
  },
  'PaperCut MF': {
    what: 'The print, copy, and scan management platform for education — virtual Find-Me queues, RFID ID card swipe release, and student quota tracking.',
    why: 'It is the universal print accounting standard in NZ schools; technicians triage print spooler stalls, card association errors, and MFD embedded app faults.',
    sayThis:
      'I understand the Find-Me virtual queue model where jobs pause encrypted on the server until released via student ID badge swipe at an MFD. If printing halts campus-wide, my first check is clearing corrupt spooler jobs and restarting the PaperCut Print Provider service.',
    aliases: [
      'papercut',
      'papercut mf',
      'find-me printing',
      'follow-me printing',
      'print spooler',
      'mfd',
      'print management',
      'print quotas',
    ],
  },
  'N4L (Network for Learning)': {
    what: 'Crown-funded managed network and cyber security infrastructure connecting over 2,500 NZ schools with Fortinet firewalls, safe search, and web filtering.',
    why: 'All government school internet passes through N4L; engineers must know where school LAN responsibility ends and N4L boundary filtering begins.',
    sayThis:
      'I understand the N4L managed edge architecture — FortiGate firewalls, content filtering, and VLAN segmentation (Staff, Student, Admin, Guest) — and how to escalate legitimate website blocks or routing changes through 0800 LEARNING quoting the school ID.',
    aliases: [
      'n4l',
      'network for learning',
      'n4l managed network',
      'fortinet school',
      'school internet',
      'school filtering',
      'fortigate filtering',
    ],
  },
  'Classroom AV & Interactive Displays': {
    what: 'Classroom display systems — interactive panels (Newline, CommBox, Promethean) and projectors requiring separate video (HDMI) and touch digitizer (USB-Touch) feeds.',
    why: "A broken classroom display stops a live lesson; technicians must know the 'two-cable rule' and diagnose touch versus video faults instantly.",
    sayThis:
      'Interactive panels require two independent connections: HDMI for display and USB for touch data. When touch is unresponsive, it is almost always a disconnected, unseated or mismatched USB-Touch lead, which I isolate by checking Device Manager HID drivers and testing with a known good flylead.',
    aliases: [
      'classroom av',
      'interactive display',
      'interactive panel',
      'promethean',
      'commbox',
      'newline',
      'touch screen tv',
      'projector',
      'usb touch',
      'smart board',
    ],
  },
  'Customer Empathy & Teacher De-escalation': {
    what: 'The de-escalation framework for school IT — active listening, validating lost teaching time, deploying immediate classroom workarounds, and setting firm callback times.',
    why: 'Teachers face 30 students and tight 50-minute periods; technical competence is useless without calm empathy and clear non-condescending communication.',
    sayThis:
      "In a school, every fault threatens a teacher's lesson. I listen without interrupting, validate their stress, deploy an immediate workaround so teaching continues, and commit to a specific time during their free period to complete and test the permanent fix.",
    aliases: [
      'customer empathy',
      'teacher de-escalation',
      'de-escalation',
      'school culture',
      'hallway requests',
      'customer care',
      'teacher support',
    ],
  },
};

/** Lowercased alias → canonical glossary key, built once at module load. */
const ALIAS_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const [key, entry] of Object.entries(REFRESHERS)) {
    index.set(key.toLowerCase(), key);
    for (const alias of entry.aliases ?? []) index.set(alias.toLowerCase(), key);
  }
  return index;
})();

/**
 * Resolve one raw ad keyword to a glossary entry.
 *
 * Three passes, cheapest first: exact alias, then market.ts's canonical form
 * (so the two maps cooperate instead of each needing every variant), then a
 * containment check for the compound phrasings ads love — "Windows Server
 * administration experience" should still find "Windows Server". The
 * containment pass is length-ordered so a longer, more specific key wins over
 * a shorter one it happens to contain.
 */
const KEYS_BY_LENGTH = Object.keys(REFRESHERS).sort((a, b) => b.length - a.length);

export function refresherFor(raw: string): { key: string; entry: Refresher } | null {
  const norm = raw.toLowerCase().replace(/["'()]/g, '').trim().replace(/\s+/g, ' ');
  if (!norm) return null;

  const direct = ALIAS_INDEX.get(norm);
  if (direct) return { key: direct, entry: REFRESHERS[direct] };

  const canon = canonicalise(raw).toLowerCase();
  const viaCanon = ALIAS_INDEX.get(canon);
  if (viaCanon) return { key: viaCanon, entry: REFRESHERS[viaCanon] };

  for (const key of KEYS_BY_LENGTH) {
    const entry = REFRESHERS[key];
    const candidates = [key.toLowerCase(), ...(entry.aliases ?? [])];
    if (candidates.some((c) => c.length > 3 && norm.includes(c))) {
      return { key, entry };
    }
  }
  return null;
}

/**
 * Ad requirements that are facts about eligibility, tenure or sector history
 * rather than things that can be revised. They are real requirements and they
 * belong in the ATS analysis — they just have no place in a revision list,
 * because there is no version of "full clean NZ driver's licence" you can
 * study the night before. Filtered out here rather than in the UI so the
 * counts, the recurrence strip and the cram sheet all agree.
 */
const NOT_REVISABLE = [
  'driver',
  'licence',
  'license',
  'right to work',
  'eligibility to work',
  'working rights',
  'work rights',
  'open work',
  'visa',
  'sponsorship',
  'vetting',
  'citizenship',
  'years',
  'year ',
  'tenure',
  'degree',
  'beng',
  'qualification',
  'recent graduate',
  'recently completed studying',
  'nz tertiary',
  'wellington-based',
  'sector experience',
  'industry experience',
];

function isRevisable(raw: string): boolean {
  const k = raw.toLowerCase();
  return !NOT_REVISABLE.some((p) => k.includes(p));
}

/** Which ATS bucket a term came from, kept because it drives ordering: a term
 *  the CV does not evidence at all is the one most worth revising. */
export type TermBucket = 'missing' | 'toEvidence' | 'matched';

export interface RoleTerm {
  /** Canonical glossary key where one matched, otherwise the raw ad keyword. */
  term: string;
  /** The ad's own wording, kept for the "as the ad put it" line. */
  raw: string;
  bucket: TermBucket;
  refresher: Refresher | null;
}

const BUCKET_ORDER: Record<TermBucket, number> = { missing: 0, toEvidence: 1, matched: 2 };

/**
 * Every term worth refreshing for one role, ordered by how much revision it
 * probably needs. Deduplicated by canonical key, keeping the highest-priority
 * bucket when the same concept appears twice under different wordings — which
 * happens often, since `matched` and `toEvidence` overlap by nature.
 */
export function termsForRole(app: Application): RoleTerm[] {
  const ats = app.analysis?.ats;
  if (!ats) return [];

  const byKey = new Map<string, RoleTerm>();

  const add = (raw: string, bucket: TermBucket) => {
    if (!isRevisable(raw)) return;
    const hit = refresherFor(raw);
    const key = hit?.key ?? raw.trim();
    if (!key) return;
    const existing = byKey.get(key);
    if (existing && BUCKET_ORDER[existing.bucket] <= BUCKET_ORDER[bucket]) return;
    byKey.set(key, { term: key, raw: raw.trim(), bucket, refresher: hit?.entry ?? null });
  };

  for (const raw of ats.missing ?? []) add(raw, 'missing');
  for (const raw of ats.toEvidence ?? []) add(raw, 'toEvidence');
  for (const raw of ats.matched ?? []) add(raw, 'matched');

  return [...byKey.values()].sort((a, b) => {
    const byBucket = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
    if (byBucket !== 0) return byBucket;
    // Within a bucket, terms that actually have a refresher first — a bare
    // keyword with no glossary entry is the least useful thing to revise.
    if (Boolean(b.refresher) !== Boolean(a.refresher)) return b.refresher ? 1 : -1;
    return a.term.localeCompare(b.term);
  });
}

/** Statuses where refreshing the terminology still has a point. A rejected or
 *  withdrawn role's vocabulary is not worth the reader's evening; a role still
 *  being researched has usually not been analysed yet. */
const LIVE_STATUSES = new Set(['applied', 'interview', 'offer']);

export interface RoleRefresherEntry {
  app: Application;
  terms: RoleTerm[];
  /** Terms in the two buckets that represent real revision work. */
  gapCount: number;
}

export function rolesToRefresh(apps: Application[]): RoleRefresherEntry[] {
  return apps
    .filter((a) => LIVE_STATUSES.has(a.status) && a.analysis?.ats)
    .map((app) => {
      const terms = termsForRole(app);
      return {
        app,
        terms,
        gapCount: terms.filter((t) => t.bucket !== 'matched').length,
      };
    })
    .filter((e) => e.terms.length > 0)
    .sort((a, b) => {
      // Interview-stage roles first — that is where revision is urgent —
      // then by how much there is to revise.
      const stage = (s: string) => (s === 'interview' ? 0 : s === 'offer' ? 1 : 2);
      const byStage = stage(a.app.status) - stage(b.app.status);
      if (byStage !== 0) return byStage;
      return b.gapCount - a.gapCount;
    });
}

export interface TermFrequency {
  term: string;
  count: number;
  roles: string[];
  hasRefresher: boolean;
  /** True when at least one role has it as `missing` — a recurring gap. */
  isGap: boolean;
}

/**
 * Which terms recur across the live applications. This is the highest-leverage
 * view in the section: a term wanted by five employers is worth an evening in
 * a way a one-off keyword never is.
 */
export function termFrequencies(entries: RoleRefresherEntry[]): TermFrequency[] {
  const map = new Map<string, TermFrequency>();
  for (const { app, terms } of entries) {
    for (const t of terms) {
      const cur = map.get(t.term) ?? {
        term: t.term,
        count: 0,
        roles: [],
        hasRefresher: Boolean(t.refresher),
        isGap: false,
      };
      cur.count++;
      cur.roles.push(`${app.company} — ${app.role}`);
      if (t.bucket === 'missing') cur.isGap = true;
      map.set(t.term, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

// ------------------------------------------------------------- confidence

/** Three states, not a checkbox: "I have seen this" and "I could explain this
 *  to an interviewer" are different claims, and collapsing them is exactly the
 *  self-deception this section exists to prevent. */
export type Confidence = 'unknown' | 'shaky' | 'solid';

export const CONFIDENCE_META: {
  key: Confidence;
  label: string;
  short: string;
  tone: 'rose' | 'amber' | 'grass';
}[] = [
  { key: 'unknown', label: "Don't know it", short: 'New', tone: 'rose' },
  { key: 'shaky', label: 'Shaky — could not explain it cleanly', short: 'Shaky', tone: 'amber' },
  { key: 'solid', label: 'Solid — could answer this out loud', short: 'Solid', tone: 'grass' },
];

/** Confidence is stored per canonical term, not per role — knowing what SIEM
 *  means is a fact about the reader, not about one application, and marking it
 *  five times because five ads mention it would be busywork. */
export type ConfidenceMap = Record<string, Confidence>;

export function roleReadiness(terms: RoleTerm[], confidence: ConfidenceMap) {
  const rated = terms.filter((t) => confidence[t.term] === 'solid').length;
  return {
    score: terms.length === 0 ? 0 : Math.round((rated / terms.length) * 100),
    breakdown: terms.map((t) => ({
      key: t.term,
      done: confidence[t.term] === 'solid',
      label: t.term,
    })),
  };
}
