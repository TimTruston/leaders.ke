// Shared by the dashboard layout (its own tab set) and the root Header (the mode
// switcher, rendered above the dashboard layout in the component tree so it can't
// take `modes` as a prop). Pure and SSR-safe: driven entirely off the merged
// page data + URL, so the switcher never flashes the plain name link before
// hydration the way a client-only store would.
export type SwitcherMode = { key: string; href: string; label: string; current: boolean };

export type DashboardModesInput = {
	myCampaigns?: { leaderId: number; name: string; verified: boolean; basePath: string }[];
	isAdmin?: boolean;
	leaderContext?: { basePath: string } | null;
	// Set only when a platform admin is viewing a profile they don't personally
	// manage (the admin control bar's bypass) — without this, no entry's key
	// matches currentKey, so the switcher falls back to modes[0] ("Citizen"),
	// which is wrong: the admin IS on that profile's dashboard, just not as its manager.
	adminViewingProfileName?: string | null;
};

/** Which dashboard "mode" a URL belongs to — outside /dashboard this degrades to
 * 'campaign' harmlessly (myCampaigns is empty there anyway). */
function modeFor(pathname: string): 'admin' | 'citizen' | 'campaign' {
	const second = pathname.split('/')[2];
	if (second === 'admin') return 'admin';
	if (!second || second === 'account' || second === 'invites' || second === 'mobilize') return 'citizen';
	return 'campaign';
}

/** Every context this account can switch between right now, each flagged `current`. */
export function computeDashboardModes(pathname: string, data: DashboardModesInput): SwitcherMode[] {
	const mode = modeFor(pathname);
	const base = data.leaderContext?.basePath ?? '/dashboard';

	const currentKey = mode === 'campaign' ? `campaign:${base}` : mode;

	const campaignEntries = (data.myCampaigns ?? []).map((c) => ({
		key: `campaign:${c.basePath}`,
		href: `${c.basePath}/profile`,
		label: `Manage: ${c.name}`,
		available: true
	}));
	if (mode === 'campaign' && data.adminViewingProfileName && !(data.myCampaigns ?? []).some((c) => c.basePath === base)) {
		campaignEntries.push({ key: `campaign:${base}`, href: `${base}/profile`, label: `Admin: ${data.adminViewingProfileName}`, available: true });
	}

	return [
		{ key: 'citizen', href: '/dashboard', label: 'Citizen', available: true },
		...campaignEntries,
		{ key: 'admin', href: '/dashboard/admin/profiles', label: 'Platform admin', available: !!data.isAdmin }
	]
		.filter((m) => m.available)
		.map((m) => ({ ...m, current: m.key === currentKey }));
}
