// Whether a professional-experience title names one of the elective seats we
// already model as `positions` (and therefore seed as a Track Record `leaders`
// term). Such rows must NOT also live in `experience`, or a person's own
// governorship/senate seat shows up twice on their profile: once linked to the
// seat hub (Track Record) and once as an unlinked career row. The agentic
// experience extraction emits these; the seeder and artifacts both drop them.
//
// Kept on purpose: Deputy President (not a modeled seat), appointed committee /
// executive memberships that merely start with "Member of", and non-state
// presidencies (Law Society, party, caucus) — those are genuine career history.
/** Canonical position title this experience entry names (matching `positions.title`),
 * or null when it is not one of the modeled elective seats. Used to decide whether
 * a professional-experience row duplicates a Track Record term for the SAME seat. */
export function modeledSeatOffice(title: string, institution = ''): string | null {
	const t = title.trim().toLowerCase();
	const inst = institution.toLowerCase();
	if (/^governor\b/.test(t) && !/\bbank\b/.test(t)) return 'Governor'; // county governor (not Central Bank)
	if (/^senator\b/.test(t) || /^member of the senate\b/.test(t)) return 'Senator';
	if (/^member of parliament\b/.test(t)) return 'MP';
	if (/^member of the national assembly\b/.test(t)) return 'MP';
	if (/^member of the \d+(st|nd|rd|th) parliament\b/.test(t)) return 'MP'; // "Member of the 11th Parliament"
	if (/^member of (the )?county assembly\b/.test(t) || t === 'mca' || /\(mca\)$/.test(t)) return 'MCA';
	if (/^(woman|women'?s?) (rep|representative)\b/.test(t) || /^county woman rep/.test(t)) return 'Woman Rep';
	// "President" only when it is the Kenyan head of state, never a party/society presidency.
	if (/^president\b/.test(t) && /(government|republic) of kenya/.test(inst)) return 'President';
	return null;
}
