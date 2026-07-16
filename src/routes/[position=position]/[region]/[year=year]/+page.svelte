<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');
</script>

<svelte:head>
	<title>{data.year} {data.positionTitle} race, {data.regionLabel} — leaders.ke</title>
	<meta
		name="description"
		content="All {data.year} contestants for {data.positionTitle} of {data.regionLabel}, side by side."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
	<nav class="text-sm text-muted" aria-label="Breadcrumb">
		<a href="/leaders" class="hover:text-heading hover:underline">Leaders</a>
		<span class="mx-1">/</span>
		<a href="/{data.basePath.split('/')[1]}" class="hover:text-heading hover:underline">
			{data.positionTitle}
		</a>
		<span class="mx-1">/</span>
		<a href={data.basePath} class="hover:text-heading hover:underline">{data.regionLabel}</a>
		<span class="mx-1">/</span>
		<span>{data.year}</span>
	</nav>

	<h1 class="mt-4 text-3xl font-extrabold tracking-tight text-heading">
		{data.year}: {data.positionTitle}, {data.regionLabel}
	</h1>
	<p class="mt-2 text-sm text-muted">
		{#if data.isActiveCycle}
			{data.candidates.length} declared contestant{data.candidates.length === 1 ? '' : 's'}, side by side.
		{:else}
			The {data.year} cycle record for this seat.
		{/if}
	</p>

	{#if data.candidates.length > 0}
		<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.candidates as c (c.recordPath)}
				<div class="flex flex-col rounded-2xl border border-border bg-surface p-6">
					<div class="flex items-center gap-3">
						<Avatar name={c.name} initials={c.initials} photoUrl={c.photoUrl} sizeClass="size-16" textClass="text-xl" />
						<div class="min-w-0">
							<p class="flex items-center gap-1 font-semibold text-heading">
								<span class="truncate">{c.name}</span>
								{#if c.verified}
									<svg
										viewBox="0 0 24 24"
										fill="currentColor"
										class="size-4 shrink-0 text-primary"
										aria-label="Verified"
									>
										<path
											fill-rule="evenodd"
											d="M8.6 3.8a4.5 4.5 0 0 0-1.4 1 4.5 4.5 0 0 0-3.8 3.7 4.5 4.5 0 0 0 0 5 4.5 4.5 0 0 0 3.7 3.8 4.5 4.5 0 0 0 5 0 4.5 4.5 0 0 0 3.8-3.7 4.5 4.5 0 0 0 0-5 4.5 4.5 0 0 0-3.7-3.8 4.5 4.5 0 0 0-3.6-1Zm7 6.7a.75.75 0 1 0-1.2-.9l-3.2 4.3-1.7-1.7a.75.75 0 1 0-1 1l2.3 2.4a.75.75 0 0 0 1.1-.1l3.7-5Z"
											clip-rule="evenodd"
										/>
									</svg>
								{/if}
							</p>
							{#if c.party}
								<p class="text-xs text-muted">{c.party}</p>
							{/if}
						</div>
					</div>

					<dl class="mt-4 grid flex-1 grid-cols-2 gap-3 border-t border-border pt-4">
						<div>
							<dt class="text-xs text-muted">Manifesto pillars</dt>
							<dd class="text-lg font-bold tabular-nums text-heading">{c.pillarCount}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted">Followers</dt>
							<dd class="text-lg font-bold tabular-nums text-heading">{fmt.format(c.followerCount)}</dd>
						</div>
					</dl>

					<div class="mt-4 flex gap-2">
						{#if data.isActiveCycle}
							<a
								href={c.campaignPath}
								class="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-on-primary transition hover:brightness-95"
							>
								Campaign
							</a>
						{/if}
						<a
							href={c.recordPath}
							class="flex-1 rounded-full border border-border px-4 py-2 text-center text-sm font-semibold text-heading transition hover:bg-surface-2"
						>
							Profile
						</a>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
			<p class="font-semibold text-heading">
				{data.isActiveCycle ? 'No declared contestants yet' : `No ${data.year} record for this seat yet`}
			</p>
			{#if data.isActiveCycle}
				<p class="mx-auto mt-2 max-w-md text-sm text-muted">
					Vying here in {data.year}? Claim your profile and be the first on the ballot page.
				</p>
				<a
					href="/signup"
					class="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
				>
					Claim your profile
				</a>
			{:else}
				<a href={data.basePath} class="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
					View the seat's history →
				</a>
			{/if}
		</div>
	{/if}
</section>
