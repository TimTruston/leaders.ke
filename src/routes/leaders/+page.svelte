<script lang="ts">
	import { goto } from '$app/navigation';
	import { counties } from '$lib/data/geo';
	import LeaderCard from '$lib/components/LeaderCard.svelte';
	import Paginator from '$lib/components/Paginator.svelte';
	import PositionBadges from '$lib/components/PositionBadges.svelte';
	import SearchFilter from '$lib/components/SearchFilter.svelte';
	import type { PageProps } from './$types';

	const PAGE_SIZE = 20;

	let { data }: PageProps = $props();

	// Filtered/paginated client-side. Server pagination + query-param filters
	// come when the register grows large enough to need it.
	const allLeaders = $derived(data.dbLeaders);

	// Positions that actually have someone; PositionBadges orders them by hierarchy.
	const positions = $derived([...new Set(allLeaders.map((l) => l.positionTitle))]);

	const parties = $derived(
		[...new Set(allLeaders.map((l) => l.party).filter(Boolean))].sort() as string[]
	);

	// Distinct regions for the currently selected position badge, feeding SearchFilter's drill-down.
	const regionsForPosition = $derived(
		[...new Set(allLeaders.filter((l) => l.positionTitle === position).map((l) => l.countyLabel))].sort()
	);

	let position = $state('President');
	let region = $state('');
	let party = $state('');
	let status = $state<'' | 'current' | 'aspirant'>('');
	let query = $state('');
	let page = $state(1);

	// Switching position badge invalidates whatever region was selected for the old one.
	$effect(() => {
		position;
		region = '';
	});

	// MCA leaders are listed by ward (countyLabel); the SearchFilter picks a
	// constituency, so map each ward back to its parent constituency to match them.
	const constituencyByWard = new Map(
		counties.flatMap((c) => c.constituencies).flatMap((con) => con.wards.map((w) => [w.seatName, con.seatName]))
	);

	// Regimes: election-cycle windows a term can overlap. '' = all time (the
	// classic directory view). A multi-term person appears in every era they
	// served, wearing that era's seat.
	const ERAS: { key: string; label: string; start: number; end: number }[] = [
		{ key: '2022', label: '2022-Now', start: Date.parse('2022-09-01'), end: Infinity },
		{ key: '2017', label: '2017-2022', start: Date.parse('2017-08-01'), end: Date.parse('2022-08-31') },
		{ key: '2013', label: '2013-2017', start: Date.parse('2013-03-01'), end: Date.parse('2017-07-31') },
		{ key: '2008', label: '2008-2013', start: Date.parse('2008-01-01'), end: Date.parse('2013-02-28') },
		{ key: '2003', label: '2003-2008', start: Date.parse('2003-01-01'), end: Date.parse('2007-12-31') },
		{ key: 'earlier', label: 'Earlier', start: 0, end: Date.parse('2002-12-31') }
	];
	let regime = $state('');
	// Only offer eras that actually have someone for the selected position.
	const availableEras = $derived(
		ERAS.filter((e) =>
			allLeaders.some(
				(l) =>
					(!position || l.positionTitle === position) &&
					l.termStart <= e.end &&
					(l.termEnd ?? Infinity) >= e.start
			)
		)
	);

	// Verified profiles rank first within the filtered set — verification is the product.
	// Then by term status (current, aspirant, former), then reach.
	const STATUS_ORDER: Record<string, number> = { current: 0, aspirant: 1, former: 2 };
	const POSITION_RANK: Record<string, number> = { President: 0, Governor: 1, Senator: 2, MP: 3, 'Woman Rep': 4, MCA: 5 };
	const filtered = $derived.by(() => {
		const era = ERAS.find((e) => e.key === regime);
		const matches = allLeaders.filter(
			(l) =>
				(!region ||
					(position === 'MCA'
						? constituencyByWard.get(l.countyLabel) === region
						: l.countyLabel === region)) &&
				(!position || l.positionTitle === position) &&
				(!party || l.party === party) &&
				(!status || l.status === status) &&
				(!query || l.name.toLowerCase().includes(query.toLowerCase())) &&
				(!era || (l.termStart <= era.end && (l.termEnd ?? Infinity) >= era.start))
		);
		// One card per person within the view: in an era, their most senior seat of
		// that era; across all time, their non-former (else latest) term.
		const bySlug = new Map<string, (typeof matches)[number]>();
		for (const l of matches) {
			const kept = bySlug.get(l.slug);
			const better = !kept
				? true
				: era
					? (POSITION_RANK[l.positionTitle] ?? 9) < (POSITION_RANK[kept.positionTitle] ?? 9)
					: kept.status === 'former' &&
						(l.status !== 'former' || (l.termEnd ?? Infinity) > (kept.termEnd ?? 0));
			if (better) bySlug.set(l.slug, l);
		}
		return [...bySlug.values()].sort(
			(a, b) =>
				Number(b.verified) - Number(a.verified) ||
				(STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) ||
				(a.status === 'former' ? (b.termEnd ?? Infinity) - (a.termEnd ?? Infinity) : 0) ||
				b.followers - a.followers
		);
	});

	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
	// Reset to page 1 whenever the filtered set changes underneath the current page.
	$effect(() => {
		filtered;
		page = 1;
	});
	const paged = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	function clearFilters() {
		region = '';
		position = 'President';
		party = '';
		status = '';
		query = '';
	}

	const hasFilters = $derived(
		!!(region || position !== 'President' || party || status || query)
	);
</script>

<svelte:head>
	<title>Leaders — leaders.ke</title>
	<meta
		name="description"
		content="Browse verified leaders and 2027 candidates by county, position and party."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">The Leaders Database</h1>
		<p class="mt-3 text-base leading-relaxed">
			Verified leaders and candidates ahead of the 2027 General Elections. 
		</p>
	</div>

	<!-- Position badges: single-select pill bar, matching the pricing page's office selector -->
	<div class="mt-8 flex justify-center">
		<PositionBadges {positions} bind:value={position}/>
	</div>

	<!-- Filters: stack on mobile, row on wider screens -->
	<div class="mt-4 flex flex-wrap justify-center gap-2">

		<input
			type="search"
			placeholder="Search by name, then press Enter to search everything"
			bind:value={query}
			onkeydown={(e) => {
				if (e.key === 'Enter' && query.trim()) goto(`/search?q=${encodeURIComponent(query.trim())}`);
			}}
			class="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none sm:w-64"
		/>
		{#key position}
			<SearchFilter
				lockTitle={position}
				regions={regionsForPosition}
				{parties}
				bind:region
				bind:party
				bind:status
				{hasFilters}
				onClear={clearFilters}
			/>
		{/key}
	</div>

	<!-- Regime line: subtle year-range links; only eras with people for this position -->
	<p class="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
		<span>Regimes:</span>
		<button
			type="button"
			onclick={() => (regime = '')}
			class="transition hover:text-heading {regime === '' ? 'font-semibold text-primary underline underline-offset-4' : ''}"
		>All</button>
		{#each availableEras as era (era.key)}
			<button
				type="button"
				onclick={() => (regime = era.key)}
				class="transition hover:text-heading {regime === era.key ? 'font-semibold text-primary underline underline-offset-4' : ''}"
			>
				{era.label}
			</button>
		{/each}
	</p>

	<p class="mt-6 text-sm text-muted">
		{filtered.length} leader{filtered.length === 1 ? '' : 's'}
	</p>

	<!-- Results -->
	<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each paged as leader (leader.path)}
			<LeaderCard
				path={leader.path}
				name={leader.name}
				initials={leader.initials}
				photoUrl={leader.photoUrl}
				verified={leader.verified}
				party={leader.party}
				partyPath={'partyPath' in leader ? leader.partyPath : null}
				positionTitle={leader.positionTitle}
				region={leader.countyLabel}
				status={leader.status}
				followers={leader.followers}
			/>
		{:else}
			<div class="rounded-2xl border border-border bg-surface p-8 text-center sm:col-span-2 lg:col-span-3">
				<p class="font-semibold text-heading">No leaders match those filters</p>
				<p class="mt-2 text-sm text-muted">
					Try clearing a filter, or claim this space for your own campaign.
				</p>
				<a
					href="/signup"
					class="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
				>
					Claim your profile
				</a>
			</div>
		{/each}
	</div>

	<Paginator bind:page {totalPages} />

	<!-- CTA -->
	<div class="mt-14 rounded-3xl bg-surface-2 px-6 py-10 text-center">
		<h2 class="text-xl font-bold text-heading">Vying in 2027 and not listed here?</h2>
		<p class="mx-auto mt-2 max-w-xl text-sm leading-relaxed">
			Claim your profile, get verified against IEBC records, and mobilize your team!
		</p>
		<a
			href="/signup"
			class="mt-5 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition hover:brightness-95"
		>
			Get verified
		</a>
	</div>
</section>
