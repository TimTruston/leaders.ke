<script lang="ts">
	import { goto, preloadData } from '$app/navigation';
	import LeaderCard from '$lib/components/LeaderCard.svelte';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import PositionBadges from '$lib/components/PositionBadges.svelte';
	import SearchFilter from '$lib/components/SearchFilter.svelte';
	import { POSITION_SLUG_BY_TITLE } from '$lib/utils/seat';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The pill bar navigates between the per-position pages (like /rank).
	const PILL_TITLES = ['President', 'Governor', 'Senator', 'MP', 'Woman Rep', 'MCA'];
	const hrefFor = (title: string) => `/${POSITION_SLUG_BY_TITLE[title] ?? 'presidents'}`;
	const slug = $derived(POSITION_SLUG_BY_TITLE[data.positionTitle]);

	// Directory filters live in the URL (shareable, back/forward-safe). Local state
	// mirrors the loaded values; the effects below navigate when the user changes one.
	let region = $state('');
	let party = $state('');
	let status = $state<'' | 'current' | 'aspirant'>('');
	let query = $state('');
	$effect(() => {
		region = data.filters.region;
		party = data.filters.party;
		status = data.filters.status;
		query = data.filters.q;
	});

	function directoryUrl(page: number, q = query) {
		const params = new URLSearchParams();
		if (region) params.set('region', region);
		if (party) params.set('party', party);
		if (status) params.set('status', status);
		if (q.trim()) params.set('q', q.trim());
		if (page > 1) params.set('page', String(page));
		const qs = params.toString();
		return `/${slug}${qs ? `?${qs}` : ''}`;
	}

	// Dropdown/toggle changes navigate immediately…
	$effect(() => {
		if (region === data.filters.region && party === data.filters.party && status === data.filters.status) return;
		goto(directoryUrl(1), { noScroll: true, keepFocus: true });
	});
	// …the name search debounces while typing.
	$effect(() => {
		const q = query;
		if (q === data.filters.q) return;
		const t = setTimeout(() => goto(directoryUrl(1, q), { noScroll: true, keepFocus: true }), 300);
		return () => clearTimeout(t);
	});

	function clearFilters() {
		goto(`/${slug}`, { noScroll: true });
	}
	const hasFilters = $derived(!!(data.filters.region || data.filters.party || data.filters.status || data.filters.q));

	// Warm the sibling positions in the background so pill hops land instantly.
	$effect(() => {
		const others = PILL_TITLES.map((t) => POSITION_SLUG_BY_TITLE[t]).filter((s) => s && s !== slug);
		const idle = setTimeout(() => others.forEach((s) => void preloadData(`/${s}`)), 500);
		return () => clearTimeout(idle);
	});
</script>

<svelte:head>
	<title>{data.positionTitle}s — leaders.ke</title>
	<meta
		name="description"
		content="Every {data.positionTitle} and 2027 candidate: regions, incumbents and cleared contestants."
	/>
</svelte:head>

<!-- Leader directory: the old /leaders grid, scoped to this position and
server-paginated. On single-region seats (President) it sits below the hub. -->
<section class="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
	<div class="border-t border-border pt-10">
		<div class="mt-4 flex flex-col sm:flex-row justify-between gap-2 items-start">
			<h1 class="text-3xl font-extrabold tracking-tight text-heading">{data.positionTitle}s</h1>
			<PositionBadges positions={PILL_TITLES} value={data.positionTitle} {hrefFor} />
		</div>
		<p class="mt-2 text-sm leading-relaxed text-muted">
			Verified {data.positionTitle}s and 2027 contestants.
		</p>
	</div>


	<div class="mt-4 flex flex-wrap gap-2">
		<input
			type="search"
			placeholder="Search by name, then press Enter to search everything"
			bind:value={query}
			onkeydown={(e) => {
				if (e.key === 'Enter' && query.trim()) goto(`/search?q=${encodeURIComponent(query.trim())}`);
			}}
			class="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none sm:w-64"
		/>
		{#key data.positionTitle}
			<SearchFilter
				lockTitle={data.positionTitle}
				regions={data.directory.regionOptions}
				parties={data.directory.partyOptions}
				bind:region
				bind:party
				bind:status
				{hasFilters}
				onClear={clearFilters}
			/>
		{/key}
	</div>

	<p class="mt-6 text-sm text-muted">
		{data.directory.total} leader{data.directory.total === 1 ? '' : 's'}
	</p>

	<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.directory.leaders as leader (leader.path)}
			<LeaderCard
				path={leader.path}
				name={leader.name}
				initials={leader.initials}
				photoUrl={leader.photoUrl}
				verified={leader.verified}
				party={leader.party}
				partyPath={leader.partyPath}
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

	<Pagination
		page={data.filters.page}
		totalPages={Math.max(1, Math.ceil(data.directory.total / data.pageSize))}
		total={data.directory.total}
		itemLabel="leaders"
		href={(p) => directoryUrl(p)}
	/>

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
