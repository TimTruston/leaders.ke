// Rejecting a claim that already granted access (see onboard.ts — access is
// immediate, review happens after) needs something to revert TO. There's no
// "before" snapshot of the live profile, so this restores the seed pipeline's own
// committed record instead: scripts/out/dossiers.json, keyed by userId. Covers
// everything a claimant could rewrite that the seed pipeline actually sourced:
// name, slug, photo, bio, party, and experience (education/professional). Team,
// contacts, and posts aren't seed data at all — reviewClaim (claims.ts)
// handles those separately (clear rather than restore).
// Known limitation: the bio is the RAW scraped text, not whatever AI-rewritten
// version the agentic pipeline may have later written — restoring to
// source-verified content, not necessarily byte-identical to what was live before.
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { experience, parties, partyMemberships, users } from '$lib/server/db/schema';

type DossierBio = { text: string };
type DossierTerm = { party?: string | null };
type DossierEducation = { institution?: string; degree?: string; description?: string };
type DossierExperience = { organization?: string; position?: string; description?: string };
type DossierRawProfile = { education?: DossierEducation[]; experience?: DossierExperience[] };
type DossierEntry = {
	userId: number | null;
	canonicalName: string;
	platformSlug: string | null;
	bios: DossierBio[];
	terms: DossierTerm[];
	rawProfiles?: DossierRawProfile[];
};

let cachedDossiers: DossierEntry[] | null = null;

async function loadDossiers(): Promise<DossierEntry[]> {
	if (cachedDossiers) return cachedDossiers;
	const raw = await readFile(path.join(process.cwd(), 'scripts/out/dossiers.json'), 'utf-8');
	cachedDossiers = (JSON.parse(raw).dossiers as DossierEntry[]) ?? [];
	return cachedDossiers;
}

/** Same convention the app enforces everywhere else: firstName is a single word,
 * otherNames is everything after it (see validateOnboardInput/campaignRoles). */
function splitName(fullName: string): { firstName: string; otherNames: string } {
	const [firstName, ...rest] = fullName.trim().split(/\s+/);
	return { firstName, otherNames: rest.join(' ') || firstName };
}

export async function restoreFromSeed(subjectUserId: number): Promise<{ ok: true } | { ok: false; error: string }> {
	let dossiers: DossierEntry[];
	try {
		dossiers = await loadDossiers();
	} catch {
		return { ok: false, error: 'Could not read the seed record (dossiers.json unavailable).' };
	}
	const entry = dossiers.find((d) => d.userId === subjectUserId);
	if (!entry) return { ok: false, error: 'No seed record found for this profile — nothing to restore to.' };

	if (entry.canonicalName) {
		const { firstName, otherNames } = splitName(entry.canonicalName);
		await db.update(users).set({ firstName, otherNames }).where(eq(users.id, subjectUserId));
	}

	if (entry.platformSlug) {
		await db.update(users).set({ slug: entry.platformSlug }).where(eq(users.id, subjectUserId));
	}

	if (entry.bios[0]?.text) {
		await db.update(users).set({ bio: entry.bios[0].text }).where(eq(users.id, subjectUserId));
	}

	// Photo: the seed pipeline (seed-photos.ts) points photoUrl at a git-shipped
	// static/leaders/<slug>.jpg when one exists, else leaves it null — reproduce
	// that same rule rather than guessing from dossier source URLs (which are
	// external and not what actually ended up live).
	if (entry.platformSlug) {
		const staticPath = path.join(process.cwd(), 'static', 'leaders', `${entry.platformSlug}.jpg`);
		const hasPhoto = await access(staticPath).then(
			() => true,
			() => false
		);
		await db.update(users).set({ photoUrl: hasPhoto ? `/leaders/${entry.platformSlug}.jpg` : null }).where(eq(users.id, subjectUserId));
	}

	// Party: the first term that actually names one (not necessarily terms[0] —
	// e.g. a later 2027 aspirant entry can have a null party).
	const seedPartyName = entry.terms.find((t) => t.party)?.party;
	if (seedPartyName) {
		const [party] = await db.select({ id: parties.id }).from(parties).where(or(eq(parties.name, seedPartyName), eq(parties.abbreviation, seedPartyName)));
		if (party) {
			const [live] = await db
				.select({ id: partyMemberships.id, partyId: partyMemberships.partyId })
				.from(partyMemberships)
				.where(and(eq(partyMemberships.subjectUserId, subjectUserId), isNull(partyMemberships.deletedAt), isNull(partyMemberships.endAt)));
			if ((live?.partyId ?? null) !== party.id) {
				if (live) await db.update(partyMemberships).set({ endAt: new Date(), updatedAt: new Date() }).where(eq(partyMemberships.id, live.id));
				await db.insert(partyMemberships).values({ partyId: party.id, subjectUserId, role: 'Member', startAt: new Date() });
			}
		}
	}

	// Experience: drop whatever's live (the claimant's own edits) and rebuild from
	// every rawProfiles source's education/professional entries. Years in the source
	// are free-text ranges too inconsistent to parse reliably ("1981–Present.",
	// "(1977–1980) ,(1980–1981)") — startAt/endAt stay null, same as the schema's
	// own documented fallback for an unparseable range, rather than guess wrong.
	await db.update(experience).set({ deletedAt: new Date() }).where(and(eq(experience.subjectUserId, subjectUserId), isNull(experience.deletedAt)));
	for (const profile of entry.rawProfiles ?? []) {
		for (const ed of profile.education ?? []) {
			if (!ed.degree && !ed.institution) continue;
			await db.insert(experience).values({
				subjectUserId,
				type: 'education',
				title: (ed.degree ?? 'Education').slice(0, 255),
				institution: (ed.institution ?? '').slice(0, 255),
				description: ed.description?.slice(0, 500) ?? null
			});
		}
		for (const exp of profile.experience ?? []) {
			if (!exp.position && !exp.organization) continue;
			await db.insert(experience).values({
				subjectUserId,
				type: 'professional',
				title: (exp.position ?? 'Experience').slice(0, 255),
				institution: (exp.organization ?? '').slice(0, 255),
				description: exp.description?.slice(0, 500) ?? null
			});
		}
	}

	return { ok: true };
}
