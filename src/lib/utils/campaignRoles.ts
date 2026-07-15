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
