<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');

	// Office band drives the price (same mapping as the public /pricing page).
	const bands = [
		{ band: 'ward', label: 'MCA' },
		{ band: 'regional', label: 'Governor, Senator, MP, Woman Rep' },
		{ band: 'national', label: 'President & Vice President' }
	];
	const tiers = [
		{ tier: 'aspirant', name: 'Aspirant', tagline: 'Launch your bid', highlights: ['1 campaign page', '1 campaign manager', '100 ambassadors', '10,000 subscriptions'] },
		{ tier: 'influencer', name: 'Influencer', tagline: 'Grow your movement', highlights: ['3 campaign pages', '1,000 ambassadors / campaign', 'IEBC blue-check', 'Private voter register', 'Fundraise for campaigns'] },
		{ tier: 'mobilizer', name: 'Mobilizer', tagline: 'Command the race', highlights: ['Unlimited everything', 'Competitor & sentiment analytics', 'Daily AI audio broadcast', '5 GB storage'] }
	];

	// Prefilled from the seat chosen on Profile (its band); falls back to the most
	// common candidate office when no position was picked.
	let band = $state(data.defaultBand ?? 'regional');
	let annual = $state(false);
	const cycle = $derived(annual ? 'annual' : 'monthly');

	const priceOf = (tier: string) => data.rates[band]?.[tier]?.[cycle] ?? null;
	const cycleSuffix = $derived(annual ? '/yr' : '/mo');

	// Forwards everything step 3 carried here (firstName/otherNames/status/partyId/
	// positionId/myRole/nationalId, or linkSubjectId) straight into checkout, plus
	// this step's own tier/band/cycle choice.
	function checkoutHref(tier: string) {
		return `/onboard/checkout${page.url.search}&tier=${tier}&band=${band}&cycle=${cycle}`;
	}

	let hovered = $state<number | null>(null);
	const active = $derived(hovered ?? 1);
</script>

<svelte:head><title>Pick a Plan</title></svelte:head>

<div class="text-center">
	<h1 class="text-2xl font-bold text-heading">Pick a plan for {data.subjectName}</h1>
	<p class="mx-auto mt-2 max-w-xl text-sm text-muted">Select your office to see your price, then choose the package that fits your campaign.</p>
</div>

<!-- Office selector -->
<div class="mt-6 flex justify-center">
	<div class="w-full overflow-x-auto">
		<div class="mx-auto flex w-max items-center gap-1 rounded-full border border-border bg-surface-2 p-1" role="group" aria-label="Office">
			{#each bands as b (b.band)}
				<button type="button" aria-pressed={band === b.band} onclick={() => (band = b.band)} class="rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition {band === b.band ? 'bg-primary text-on-primary' : 'text-muted hover:text-heading'}">{b.label}</button>
			{/each}
		</div>
	</div>
</div>

<!-- Package cards -->
<div class="mt-10 grid gap-6 md:grid-cols-3">
	{#each tiers as t, i (t.tier)}
		<div
			role="group"
			onmouseenter={() => (hovered = i)}
			onmouseleave={() => (hovered = null)}
			onfocusin={() => (hovered = i)}
			onfocusout={() => (hovered = null)}
			class="relative flex flex-col rounded-3xl border bg-surface p-6 transition-all duration-300 {active === i ? '-translate-y-1 border-primary shadow-lg ring-1 ring-primary' : 'border-border'}"
		>
			{#if i === 1}<span class="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-on-primary">Most popular</span>{/if}
			<h2 class="text-lg font-bold text-heading">{t.name}</h2>
			<p class="text-sm text-muted">{t.tagline}</p>
			<p class="mt-4">
				{#if priceOf(t.tier) !== null}
					<span class="text-2xl font-extrabold tabular-nums text-heading">KES {fmt.format(priceOf(t.tier)!)}</span>
					<span class="text-sm text-muted">{cycleSuffix}</span>
				{:else}
					<span class="text-sm text-muted">Price unavailable</span>
				{/if}
			</p>
			<ul class="mt-4 flex-1 space-y-2">
				{#each t.highlights as perk (perk)}
					<li class="flex items-start gap-2 text-sm"><span class="mt-0.5 text-primary">✓</span><span>{perk}</span></li>
				{/each}
			</ul>
			<a href={checkoutHref(t.tier)} class="mt-6 rounded-full bg-primary px-4 py-2.5 text-center font-semibold text-on-primary transition hover:brightness-95">Choose {t.name}</a>
		</div>
	{/each}
</div>

<!-- Billing toggle -->
<div class="mt-8 flex items-center justify-center">
	<div class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1" role="group" aria-label="Billing cycle">
		<button type="button" aria-pressed={!annual} onclick={() => (annual = false)} class="rounded-full px-4 py-1.5 text-sm font-semibold transition {!annual ? 'bg-primary text-on-primary' : 'text-muted hover:text-heading'}">Monthly</button>
		<button type="button" aria-pressed={annual} onclick={() => (annual = true)} class="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition {annual ? 'bg-primary text-on-primary' : 'text-muted hover:text-heading'}">
			Annual
			<span class="rounded-full px-1.5 py-0.5 text-xs {annual ? 'bg-on-primary/15 text-on-primary' : 'bg-primary-soft text-on-primary'}">2 months free</span>
		</button>
	</div>
</div>
