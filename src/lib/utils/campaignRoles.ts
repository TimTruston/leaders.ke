// The capacities in which someone creates or claims a leader profile — the
// "My role" dropdown on the apply/claim Team tabs, validated server-side too.
export const CAMPAIGN_ROLES = [
	'The leader (this profile is me)',
	'Campaign manager',
	'Communications / press lead',
	'Personal assistant',
	'Social media manager',
	'Party official',
	'Family member',
	'Volunteer coordinator'
] as const;

export function isCampaignRole(value: string): boolean {
	return (CAMPAIGN_ROLES as readonly string[]).includes(value);
}

// A standard Kenyan National ID number is 7-8 digits.
export const NATIONAL_ID_REGEX = /^[0-9]{7,8}$/;

export function isValidNationalId(value: string): boolean {
	return NATIONAL_ID_REGEX.test(value);
}

// Everything held on a manager's `managers.roles` jsonb: their admin flag plus
// their own sign-off (role title and national ID number) — per manager, never
// shared, so each team member attests separately. Their ID IMAGES live on the
// manager's own `users` row (idFrontUrl/idBackUrl): an identity follows the
// person, so a manager who joins a second team never re-uploads.
export type ManagerRoles = {
	admin?: boolean;
	title?: string;
	nationalId?: string;
};

/** A manager's sign-off is complete once they've named their role, national ID,
 * and their own users row carries both sides of their ID. */
export function signoffComplete(
	roles: ManagerRoles | null | undefined,
	idImages: { idFrontUrl: string | null; idBackUrl: string | null } | null | undefined
): boolean {
	return !!(roles?.title && roles?.nationalId && idImages?.idFrontUrl && idImages?.idBackUrl);
}
