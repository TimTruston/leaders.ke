// Shared by the dashboard layout (its own tab set) and the root Header (the mode
// switcher, rendered above the dashboard layout in the component tree so it can't
// take `modes` as a prop). Pure and SSR-safe: driven entirely off the merged
// page data + URL, so the switcher never flashes the plain name link before
// hydration the way a client-only store would.
export type SwitcherMode = { key: string; href: string; label: string; current: boolean };

export type DashboardModesInput = {
	myCampaigns?: { leaderId: number; name: string; verified: boolean; basePath: string }[];
	pendingClaims?: { slug: string; name: string; outcome?: 'approved' | 'rejected' | null }[];
	isAdmin?: boolean;
	claimName?: string | null;
	leaderContext?: { basePath: string } | null;
	// Set only when a platform admin is viewing a profile they don't personally
	// manage (the admin control bar's bypass) — without this, no entry's key
	// matches currentKey, so the switcher falls back to modes[0] ("Citizen"),
	// which is wrong: the admin IS on that profile's dashboard, just not as its manager.
	adminViewingProfileName?: string | null;
};

/** Which dashboard "mode" a URL belongs to — outside /dashboard this degrades to
 * 'campaign' harmlessly (myCampaigns/pendingClaims are empty there anyway). */
function modeFor(pathname: string): 'admin' | 'apply' | 'claim' | 'citizen' | 'campaign' {
	const second = pathname.split('/')[2];
	if (second === 'admin') return 'admin';
	if (second === 'apply') return 'apply';
	if (second === 'claim') return 'claim';
	if (!second || second === 'account' || second === 'invites' || second === 'mobilize') return 'citizen';
	return 'campaign';
}

/** Every context this account can switch between right now, each flagged `current`. */
export function computeDashboardModes(
	pathname: string,
	params: Record<string, string | undefined>,
	data: DashboardModesInput
): SwitcherMode[] {
	const mode = modeFor(pathname);
	const base =
		mode === 'apply' ? `/dashboard/apply/${params.id}` : mode === 'claim' ? `/dashboard/claim/${params.slug}` : (data.leaderContext?.basePath ?? '/dashboard');

	const currentKey = mode === 'apply' || mode === 'campaign' ? `campaign:${base}` : mode === 'claim' ? `claim:${params.slug}` : mode;

	const campaignEntries = (data.myCampaigns ?? []).map((c) => ({
		key: `campaign:${c.basePath}`,
		href: `${c.basePath}/profile`,
		label: `Manage: ${c.name}`,
		available: true
	}));
	if (mode === 'apply' && !(data.myCampaigns ?? []).some((c) => c.basePath === base)) {
		campaignEntries.push({ key: `campaign:${base}`, href: `${base}/profile`, label: 'New application', available: true });
	}
	if (mode === 'campaign' && data.adminViewingProfileName && !(data.myCampaigns ?? []).some((c) => c.basePath === base)) {
		campaignEntries.push({ key: `campaign:${base}`, href: `${base}/profile`, label: `Admin: ${data.adminViewingProfileName}`, available: true });
	}

	const claimEntries = (data.pendingClaims ?? []).map((c) => ({
		key: `claim:${c.slug}`,
		href: `/dashboard/claim/${c.slug}/profile`,
		label: `Manage: ${c.name}`,
		available: true
	}));
	if (mode === 'claim' && !(data.pendingClaims ?? []).some((c) => c.slug === params.slug)) {
		claimEntries.push({ key: `claim:${params.slug}`, href: `${base}/profile`, label: `Manage: ${data.claimName}`, available: true });
	}

	return [
		{ key: 'citizen', href: '/dashboard', label: 'Citizen', available: true },
		...campaignEntries,
		...claimEntries,
		{ key: 'admin', href: '/dashboard/admin/profiles', label: 'Platform admin', available: !!data.isAdmin }
	]
		.filter((m) => m.available)
		.map((m) => ({ ...m, current: m.key === currentKey }));
}
