// Agentic pass over scripts/out/dossiers.json -> scripts/out/agentic-output.json.
// Per dossier:
//   - firstName (single word) + otherNames (the rest), from the canonical name
//   - contacts normalized (phones to 254XXXXXXXXX: strip +/leading 0, prefix 254),
//     keeping misfits as-is rather than dropping them, provenance intact
//   - experience (education/professional) extracted from the combined bios (Claude)
//   - one fresh comprehensive bio written from all sources without repeating them
//     or reading like them (Claude)
// Dossiers with no bios get the mechanical fields only. Resumable: keys already in
// the output file are skipped; Ctrl-C any time.
//
//   bun run scripts/agentic-dossiers.ts             # needs ANTHROPIC_API_KEY in .env
//   bun run scripts/agentic-dossiers.ts --mechanical-only
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';

const OUT_DIR = join(import.meta.dir, 'out');
const IN_FILE = join(OUT_DIR, 'dossiers.json');
const OUT_FILE = join(OUT_DIR, 'agentic-output.json');
const MODEL = 'claude-sonnet-5';

type ContactFact = { value: string; url: string | null; publisher: string; fetchedAt: string | null };
type Dossier = {
	key: string;
	canonicalName: string;
	names: string[];
	platformSlug: string | null;
	userId: number | null;
	terms: { parliament: string; seat: string; region: string | null; party: string | null; note?: string }[];
	bios: { text: string; source: string; url: string | null; parliament: string | null }[];
	committees: Record<string, string[]>;
	contacts: { emails: ContactFact[]; phones: ContactFact[]; links: ContactFact[] };
};

type ExperienceRow = { title: string; institution: string; startAt: string | null; endAt: string | null };
type OutputEntry = {
	key: string;
	userId: number | null;
	platformSlug: string | null;
	firstName: string;
	otherNames: string;
	contacts: { emails: ContactFact[]; phones: ContactFact[]; links: ContactFact[] };
	/** null when the dossier had no bios to work from. */
	bio: string | null;
	bioSources: string[]; // URLs of the bios the rewrite drew on
	education: ExperienceRow[];
	professional: ExperienceRow[];
};

/** "0722513900" -> "254722513900", "+254 722-513900" -> "254722513900";
 * anything that still doesn't look like a Kenyan number is kept as-is
 * (a misfit contact beats no contact). */
function normalizePhone(raw: string): string {
	const digits = raw.replace(/[^0-9]/g, '');
	if (digits.startsWith('254')) return digits;
	if (digits.startsWith('0')) return `254${digits.slice(1)}`;
	if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
	return digits || raw;
}

function normalizeContacts(c: Dossier['contacts']): OutputEntry['contacts'] {
	return {
		emails: c.emails.map((f) => ({ ...f, value: f.value.trim().toLowerCase() })),
		phones: c.phones.map((f) => ({ ...f, value: normalizePhone(f.value) })),
		links: c.links.map((f) => ({ ...f, value: f.value.trim() }))
	};
}

function splitName(name: string): { firstName: string; otherNames: string } {
	const [firstName, ...rest] = name.trim().split(/\s+/);
	return { firstName, otherNames: rest.join(' ') || firstName };
}

// ---------- the agentic part ----------

const SYSTEM = `You process one Kenyan politician's consolidated dossier at a time for leaders.ke.

You are given every scraped biography of the person (with sources), their parliamentary terms, and committee memberships. Reply with ONLY a JSON object, no markdown fences:

{
  "bio": string,          // 80-160 words. A fresh, engaging, comprehensive biography synthesizing ALL the source material. Must NOT copy sentences or distinctive phrasing from the sources — write it new. No information invented: every fact must appear in the material given. Do not repeat the same fact twice. Plain language, third person.
  "education": [ { "title": string, "institution": string, "startAt": string|null, "endAt": string|null } ],
  "professional": [ { "title": string, "institution": string, "startAt": string|null, "endAt": string|null } ]
}

education = degrees/diplomas/certificates mentioned in the bios (title = the qualification, institution = the school).
professional = non-parliamentary jobs and roles mentioned (title = the role, institution = the employer/organization). Do NOT include the parliamentary terms themselves — those are tracked separately.
Dates as "YYYY-MM-DD" (use YYYY-01-01 when only a year is known), null when not stated. Empty arrays when nothing is mentioned.`;

function dossierPrompt(d: Dossier): string {
	return JSON.stringify(
		{
			name: d.canonicalName,
			otherNameForms: d.names.slice(1),
			parliamentaryTerms: d.terms,
			committees: d.committees,
			biographies: d.bios.map((b) => ({ text: b.text, source: b.source }))
		},
		null,
		1
	);
}

const { values: flags } = parseArgs({ options: { 'mechanical-only': { type: 'boolean', default: false } } });

const dossiers: Dossier[] = JSON.parse(readFileSync(IN_FILE, 'utf8')).dossiers;
const previous: OutputEntry[] = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : [];
const done = new Map(previous.map((e) => [e.key, e]));

const useClaude = !flags['mechanical-only'];
const client = useClaude ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
if (useClaude && !process.env.ANTHROPIC_API_KEY) {
	throw new Error('ANTHROPIC_API_KEY is not set — add it to .env or run with --mechanical-only');
}

const output: OutputEntry[] = [];
let llmCalls = 0;
let failures = 0;

for (const d of dossiers) {
	// Resume: keep prior entries, but refresh their mechanical fields (cheap + keeps
	// contact normalization current); only the LLM result is expensive to redo.
	const prior = done.get(d.key);
	const { firstName, otherNames } = splitName(d.canonicalName);
	const base: OutputEntry = {
		key: d.key,
		userId: d.userId,
		platformSlug: d.platformSlug,
		firstName,
		otherNames,
		contacts: normalizeContacts(d.contacts),
		bio: prior?.bio ?? null,
		bioSources: prior?.bioSources ?? [],
		education: prior?.education ?? [],
		professional: prior?.professional ?? []
	};

	const needsLlm = useClaude && d.bios.length > 0 && !prior?.bio;
	if (needsLlm && client) {
		try {
			const response = await client.messages.create({
				model: MODEL,
				max_tokens: 1500,
				system: SYSTEM,
				messages: [{ role: 'user', content: dossierPrompt(d) }]
			});
			const text = response.content.find((b) => b.type === 'text')?.text ?? '';
			const parsed = JSON.parse(text.replace(/^```json?\s*|```\s*$/g, ''));
			base.bio = typeof parsed.bio === 'string' ? parsed.bio.trim() : null;
			base.bioSources = d.bios.map((b) => b.url).filter((u): u is string => !!u);
			base.education = Array.isArray(parsed.education) ? parsed.education : [];
			base.professional = Array.isArray(parsed.professional) ? parsed.professional : [];
			llmCalls++;
		} catch (error) {
			console.warn(`[agentic] ${d.key}: ${error instanceof Error ? error.message : error} — will retry on next run`);
			failures++;
		}
	}

	output.push(base);
	if (llmCalls > 0 && llmCalls % 10 === 0 && needsLlm) {
		writeFileSync(OUT_FILE, JSON.stringify(output.concat(previous.filter((p) => !output.some((o) => o.key === p.key))), null, '\t'));
		console.log(`[agentic] ${llmCalls} bios written so far`);
	}
}

writeFileSync(OUT_FILE, JSON.stringify(output, null, '\t'));
const withBio = output.filter((e) => e.bio).length;
const withExp = output.filter((e) => e.education.length || e.professional.length).length;
console.log(
	`[agentic] done: ${output.length} entries, ${withBio} with a rewritten bio, ${withExp} with experience rows ` +
		`(${llmCalls} Claude calls this run, ${failures} failed — re-run to retry)`
);
