<script lang="ts">
	import LeaderCard from '$lib/components/LeaderCard.svelte';
	import type { SeatHubData } from '$lib/server/seatHub';

	let { data }: { data: SeatHubData } = $props();

	const fmt = new Intl.NumberFormat('en-KE');
</script>

<svelte:head>
	<title>{data.positionTitle}, {data.regionLabel} — leaders.ke</title>
	<meta
		name="description"
		content="{data.positionTitle} of {data.regionLabel}: the incumbent, the {data.cycle} contestants and the seat's history."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
	<nav class="text-sm text-muted" aria-label="Breadcrumb">
		{#each data.breadcrumb as crumb, i (crumb.path + i)}
			{#if i > 0}<span class="mx-1">/</span>{/if}
			{#if i === data.breadcrumb.length - 1}
				<span>{crumb.label}</span>
			{:else}
				<a href={crumb.path} class="hover:text-heading hover:underline">{crumb.label}</a>
			{/if}
		{/each}
	</nav>

	<div class="mt-6 lg:mt-8 flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="flex flex-wrap items-center gap-3 text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
				{data.positionTitle}, {data.regionLabel}
				{#if data.county}
					<span class="rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-on-primary">
						County {data.county.code}
					</span>
				{/if}
			</h1>
			<p class="mt-2 text-sm text-muted">
				{data.boundary}-level seat
				{#if data.seatVoters}· {fmt.format(data.seatVoters)} registered voters (2022){/if}
				· Next vote: 10 August {data.cycle}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a
				href="{data.basePath}/{data.cycle}"
				class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				🗳️ {data.cycle} contestants
			</a>
		</div>
	</div>

	<!-- Incumbent and Salary-->
	<div class="mt-6 lg:mt-8 flex flex-col gap-6 lg:gap-8 lg:flex-row">
		<div class="flex-1">
			<h2 class="text-xl font-bold text-heading">Incumbent</h2>
			{#if data.incumbent}
				<a
					href={data.incumbent.path}
					class="group mt-4 rounded-2xl border border-border bg-surface p-5 flex items-center gap-4 transition hover:border-primary hover:shadow-sm"
				>
					<span
						class="grid size-14 shrink-0 place-items-center rounded-full bg-primary-soft text-xl font-bold text-on-primary"
					>
						{data.incumbent.initials}
					</span>
					<div class="min-w-0">
						<p class="flex items-center gap-1 font-semibold text-heading group-hover:text-primary">
							{data.incumbent.name}
							{#if data.incumbent.verified}
								<svg viewBox="0 0 24 24" fill="currentColor" class="size-4 text-primary" aria-label="Verified">
									<path
										fill-rule="evenodd"
										d="M8.6 3.8a4.5 4.5 0 0 0-1.4 1 4.5 4.5 0 0 0-3.8 3.7 4.5 4.5 0 0 0 0 5 4.5 4.5 0 0 0 3.7 3.8 4.5 4.5 0 0 0 5 0 4.5 4.5 0 0 0 3.8-3.7 4.5 4.5 0 0 0 0-5 4.5 4.5 0 0 0-3.7-3.8 4.5 4.5 0 0 0-3.6-1Zm7 6.7a.75.75 0 1 0-1.2-.9l-3.2 4.3-1.7-1.7a.75.75 0 1 0-1 1l2.3 2.4a.75.75 0 0 0 1.1-.1l3.7-5Z"
										clip-rule="evenodd"
									/>
								</svg>
							{/if}
						</p>
						<p class="text-sm text-muted">
							Serving {data.positionTitle}{data.incumbent.party ? ` · ${data.incumbent.party}` : ''}
						</p>
					</div>
				</a>
			{:else}
				<p class="mt-3 text-sm text-muted">No incumbent on record for this seat yet.</p>
			{/if}
		</div>

		<!-- SRC compensation: data pending -->
		<div class="flex flex-col flex-1">
			<h2 class="text-xl font-bold text-heading">Salary</h2>
			<p class="mt-4 rounded-2xl border border-border bg-surface-2 p-5 text-sm leading-relaxed grow">
				The Salaries and Remuneration Commission (SRC) monthly package for this seat is being
				compiled and will appear here for transparency.
			</p>
		</div>
	</div>


	<!-- Contestants -->
	<div class="mt-6 lg:mt-8">
		<div class="flex items-end justify-between gap-2">
			<h2 class="text-xl font-bold text-heading">{data.cycle} Candidates</h2>
			<a href="{data.basePath}/{data.cycle}" class="text-sm font-semibold text-primary hover:underline">
				Compare all →
			</a>
		</div>

		{#if data.contestants.length > 0}
			<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.contestants as c (c.path)}
					<LeaderCard
						path={c.path}
						name={c.name}
						initials={c.initials}
						verified={c.verified}
						party={c.party}
						partyPath={c.partyPath}
						followers={c.followers}
						compact
					/>
				{/each}
			</div>
		{:else}
			<div class="mt-6 lg:mt-8 rounded-2xl border border-dashed border-border p-6 text-center">
				<p class="text-sm text-muted">No declared contestants for this seat yet.</p>
				<a
					href="/signup"
					class="mt-3 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
				>
					Be the first: claim your profile
				</a>
			</div>
		{/if}
	</div>

	<!-- History: every recorded term for this seat, most recent first -->
	<div class="mt-6 lg:mt-8">
		<h2 class="text-xl font-bold text-heading">History</h2>
		<p class="mt-1 text-sm text-muted">Every recorded term, most recent first.</p>

		{#if data.history.length > 0}
			<ol class="mt-6 space-y-0 border-l-2 border-border pl-6">
				{#each data.history as term (term.path + term.startYear)}
					<li class="relative pb-8 last:pb-0">
						<span
							class="absolute -left-7.75 top-1 size-3 rounded-full {term.status === 'incumbent'
								? 'bg-primary'
								: 'bg-border'}"
						></span>
						<p class="text-xs font-semibold tracking-wide text-muted uppercase">
							{term.startYear} to {term.endYear ?? 'present'}
						</p>
						<a href={term.path} class="mt-1 inline-block font-semibold text-heading hover:text-primary">
							{term.name}
						</a>
						{#if term.status === 'incumbent'}
							<span class="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary">
								Incumbent
							</span>
						{/if}
					</li>
				{/each}
			</ol>
		{:else}
			<div class="mt-6 lg:mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
				<p class="font-semibold text-heading">No historical record yet</p>
				<p class="mx-auto mt-2 max-w-md text-sm text-muted">
					Past officeholders for this seat are being seeded. The timeline fills as the register grows.
				</p>
			</div>
		{/if}
	</div>
	
	<!-- Constituencies: IEBC 2022 register breakdown for county-level seats -->
	{#if data.county}
		<div class="mt-6 lg:mt-8">
			<h2 class="text-xl font-bold text-heading">
				Constituencies in {data.county.name}
				<span class="text-sm font-normal text-muted">({data.county.constituencies.length})</span>
			</h2>
			<div class="mt-4 overflow-x-auto rounded-2xl border border-border">
				<table class="w-full min-w-120 border-collapse text-left">
					<thead>
						<tr class="bg-surface-2">
							<th class="px-4 py-3 text-sm font-semibold text-heading">Code</th>
							<th class="px-4 py-3 text-sm font-semibold text-heading">Constituency</th>
							<th class="px-4 py-3 text-sm font-semibold text-heading">Wards</th>
							<th class="px-4 py-3 text-sm font-semibold text-heading">Registered voters (2022)</th>
						</tr>
					</thead>
					<tbody>
						{#each data.county.constituencies as constituency (constituency.code)}
							<tr class="border-t border-border">
								<td class="px-4 py-3 text-sm tabular-nums text-muted">{constituency.code}</td>
								<td class="px-4 py-3">
									<a href={constituency.path} class="text-sm font-medium text-heading hover:text-primary">
										{constituency.name}
									</a>
								</td>
								<td class="px-4 py-3 text-sm tabular-nums">{constituency.wardCount}</td>
								<td class="px-4 py-3 text-sm tabular-nums">{fmt.format(constituency.voters)}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t border-border bg-surface-2">
							<td class="px-4 py-3 text-sm font-semibold text-heading" colspan="2">
								{data.county.name} County total
							</td>
							<td class="px-4 py-3 text-sm font-semibold tabular-nums text-heading">
								{data.county.constituencies.reduce((n, c) => n + c.wardCount, 0)}
							</td>
							<td class="px-4 py-3 text-sm font-semibold tabular-nums text-heading">
								{fmt.format(data.county.voters)}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	{/if}

</section>
