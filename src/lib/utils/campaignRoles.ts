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

// Everything held on a manager's `managers.roles` jsonb: their admin flag plus
// their own sign-off (role, national ID, and ID images) — per manager, never
// shared, so each team member attests separately.
export type ManagerRoles = {
	admin?: boolean;
	title?: string;
	nationalId?: string;
	idFrontUrl?: string;
	idBackUrl?: string;
};

/** A manager's sign-off is complete once they've named their role, national ID,
 * and uploaded both sides of their ID. */
export function signoffComplete(roles: ManagerRoles | null | undefined): boolean {
	return !!(roles?.title && roles?.nationalId && roles?.idFrontUrl && roles?.idBackUrl);
}
