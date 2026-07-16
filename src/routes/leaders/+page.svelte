<script lang="ts">
	import { goto } from '$app/navigation';
	import LeaderCard from '$lib/components/LeaderCard.svelte';
	import Paginator from '$lib/components/Paginator.svelte';
	import SearchFilter from '$lib/components/SearchFilter.svelte';
	import type { PageProps } from './$types';

	const PAGE_SIZE = 20;

	let { data }: PageProps = $props();

	// Filtered/paginated client-side. Server pagination + query-param filters
	// come when the register grows large enough to need it.
	const allLeaders = $derived(data.dbLeaders);

	// Kenya's elective hierarchy, national to ward; only shown as a badge if the
	// register actually has someone in that position.
	const POSITION_ORDER = ['President', 'Governor', 'Senator', 'MP', 'Woman Rep', 'MCA'];
	const positions = $derived(
		POSITION_ORDER.filter((p) => allLeaders.some((l) => l.positionTitle === p))
	);

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

	// Verified profiles rank first within the filtered set — verification is the product.
	const filtered = $derived(
		allLeaders
			.filter(
				(l) =>
					(!region || l.countyLabel === region) &&
					(!position || l.positionTitle === position) &&
					(!party || l.party === party) &&
					(!status || l.status === status) &&
					(!query || l.name.toLowerCase().includes(query.toLowerCase()))
			)
			.toSorted((a, b) => Number(b.verified) - Number(a.verified) || b.followers - a.followers)
	);

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

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="">
			<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">Leaders</h1>
			<p class="mt-3 text-base leading-relaxed">
				Verified leaders and candidates ahead of the 2027 General Elections. 
			</p>
		</div>
	</div>

	<!-- Position badges: single-select pill bar, matching the pricing page's office selector -->
	<div class="mt-8 w-full overflow-x-auto">
		<div
			class="mx-auto flex w-max items-center gap-1 rounded-full border border-border bg-surface-2 p-1"
			role="group"
			aria-label="Position"
		>
			{#each positions as p (p)}
				<button
					type="button"
					aria-pressed={position === p}
					onclick={() => (position = p)}
					class="rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition {position === p
						? 'bg-primary text-on-primary'
						: 'text-muted hover:text-heading'}"
				>
					{p}
				</button>
			{/each}
		</div>
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
		<p class="mx-auto mt-2 max-w-lg text-sm leading-relaxed">
			Claim your profile, get verified against IEBC records, and rank above every unverified stub
			in your race.
		</p>
		<a
			href="/signup"
			class="mt-5 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition hover:brightness-95"
		>
			Get verified
		</a>
	</div>
</section>
