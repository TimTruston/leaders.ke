<script lang="ts">
	import Countdown from "$lib/components/Countdown.svelte";
	import WordCycler from '$lib/components/WordCycler.svelte';
	
	const leftSet = ['Level Up', 'Catapult', 'Propel', 'Amplify', 'Strengthen'];
	const rightSet = ['Leadership', 'Campaign', 'Publicity', 'Advocacy', 'Supporters'];

	// pricing-v2 (leaders.ke-pricing-v2.csv): one flat rate per tier — every
	// office costs the same, no more per-band price matrix.

	const tiers = ['Kickstart', 'Mobilize', 'Dominate'] as const;

	// One monthly KES price per tier, same for every office.
	const prices = [2500, 12500, 50000];

	// Card pitch: a short tagline + a few highlight perks per tier.
	const packages = [
		{
			tagline: 'Launch your bid',
			highlights: ['2 campaign managers', '10 ambassadors', '10,000 citizen subscriptions', '500 credits/mo']
		},
		{
			tagline: 'Grow your movement',
			highlights: [
				'5 campaign managers',
				'100 ambassadors',
				'100,000 citizen subscriptions',
				'Analytics: page views, conversions, pledges',
				'Agentic AI chat on your profile, campaign & channels',
				'3,000 credits/mo'
			]
		},
		{
			tagline: 'Command the race',
			highlights: [
				'Unlimited managers, ambassadors & subscriptions',
				'PR AI Agent — daily news research',
				'Voter heatmap per ward',
				'Sentiment Intelligence suite',
				'15,000 credits/mo'
			]
		}
	];

	// Base features every package includes, regardless of tier.
	const baseFeatures = [
		'Custom page, neat link, QR code',
		'Publish manifesto and past delivery',
		'IEBC blue-check verification',
		'Private voter register',
		'Press desk — publish news, tag leaders, parties',
		'Broadcast to citizens using credits*',
		'Fundraising toolkit*'
	];

	// Comparison rows: same metric across all three tiers ("—" means not included).
	const comparison = [
		{ label: 'Campaign managers', values: ['2', '5', 'Unlimited'] },
		{ label: 'Campaign ambassadors', values: ['10', '100', 'Unlimited'] },
		{ label: 'Citizen subscriptions', values: ['10,000', '100,000', 'Unlimited'] },
		{ label: 'Analytics: page views, conversions, pledges', values: ['—', '✓', '✓'] },
		{ label: 'Agentic AI chat on profile, campaign, channels', values: ['—', '✓', '✓'] },
		{ label: 'PR AI Agent — daily news research', values: ['—', '—', '✓'] },
		{ label: 'Voter heatmap per ward', values: ['—', '—', '✓'] },
		{ label: 'Sentiment Intelligence suite — campaign, competition', values: ['—', '—', '✓'] },
		{ label: 'Credits included/mo', values: ['500', '3,000', '15,000'] }
	];

	const fmt = new Intl.NumberFormat('en-KE');

	// Annual billing bills 10 months (2 free). Toggle drives every price on the page.
	let annual = $state(false);
	const cycleMultiplier = $derived(annual ? 10 : 1);
	const cycleSuffix = $derived(annual ? '/yr' : '/mo');


	// Influencer (index 1) is the default active package; hovering/focusing another overrides it.
	let hovered = $state<number | null>(null);
	const active = $derived(hovered ?? 1);
</script>

<svelte:head>
	<title>Pricing — leaders.ke</title>
	<meta
		name="description"
		content="leaders.ke subscription pricing: Kickstart, Mobilize and Dominate packages — one flat rate for every office."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="text-center">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
			<WordCycler words={leftSet}/> Your <WordCycler words={rightSet}/>
		</h1>
		<p class="mx-auto mt-4 max-w-xl text-base leading-relaxed">
			One flat rate, any office. Hover a package to explore it.
		</p>
	</div>

	<!-- Interactive package cards -->
	<div class="mt-12 grid gap-6 md:grid-cols-3">
		{#each tiers as tier, t (tier)}
			<div
				role="group"
				aria-current={active === t ? 'true' : undefined}
				onmouseenter={() => (hovered = t)}
				onmouseleave={() => (hovered = null)}
				onfocusin={() => (hovered = t)}
				onfocusout={() => (hovered = null)}
				class="relative flex flex-col rounded-3xl border bg-surface p-6 transition-all duration-300 ease-out {active ===
				t
					? '-translate-y-1 scale-[1.03] border-primary shadow-lg ring-1 ring-primary'
					: 'border-border'}"
			>
				{#if t === 1}
					<span
						class="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-on-primary"
					>
						Most popular
					</span>
				{/if}

				<h2 class="text-lg font-bold text-heading">{tier}</h2>
				<p class="text-sm text-muted">{packages[t].tagline}</p>

				<p class="mt-4">
					<span class="text-2xl font-extrabold tabular-nums text-heading">
						KES {fmt.format(prices[t] * cycleMultiplier)}
					</span>
					<span class="text-sm text-muted">{cycleSuffix}</span>
				</p>

				<ul class="mt-4 flex-1 space-y-2">
					{#each packages[t].highlights as perk (perk)}
						<li class="flex items-start gap-2 text-sm">
							<span class="mt-0.5 text-primary">✓</span>
							<span>{perk}</span>
						</li>
					{/each}
				</ul>

				<!-- Revealed under the hovered/active package -->
				<a
					href="/onboard/profile"
					tabindex={active === t ? 0 : -1}
					aria-hidden={active === t ? undefined : 'true'}
					class="mt-6 rounded-full bg-primary px-4 py-2.5 text-center font-semibold text-on-primary transition-all duration-300 hover:brightness-95 focus:ring-0 focus:ring-ring focus:outline-none {active ===
					t
						? 'translate-y-0 opacity-100'
						: 'pointer-events-none translate-y-1 opacity-0'}"
				>
					Get started
				</a>
			</div>
		{/each}
	</div>

	<!-- Monthly / Annual toggle -->
	<div class="mt-8 flex items-center justify-center">
		<div
			class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1"
			role="group"
			aria-label="Billing cycle"
		>
			<button
				type="button"
				aria-pressed={!annual}
				onclick={() => (annual = false)}
				class="rounded-full px-4 py-1.5 text-sm font-semibold transition {!annual
					? 'bg-primary text-on-primary'
					: 'text-muted hover:text-heading'}"
			>
				Monthly
			</button>
			<button
				type="button"
				aria-pressed={annual}
				onclick={() => (annual = true)}
				class="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition {annual
					? 'bg-primary text-on-primary'
					: 'text-muted hover:text-heading'}"
			>
				Annual
				<span
					class="rounded-full px-1.5 py-0.5 text-xs {annual
						? 'bg-on-primary/15 text-on-primary'
						: 'bg-primary-soft text-on-primary'}"
				>
					2 months free
				</span>
			</button>
		</div>
	</div>

	<!-- Base features -->
	<div class="mt-12 rounded-2xl bg-surface-2 p-6">
		<div class="flex flex-wrap items-end justify-between gap-2">
			<h2 class="text-xl font-semibold text-heading">Included in every package</h2>
			<a href="/features" class="text-sm font-semibold text-primary hover:underline">
				Full feature list →
			</a>
		</div>
		<ul class="mt-4 grid gap-2 sm:grid-cols-3">
			{#each baseFeatures as feature (feature)}
				<li class="flex items-start gap-2 text-sm">
					<span class="mt-0.5 text-primary">✓</span>
					<span>{feature}</span>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Tier comparison -->
	<h2 class="mt-14 text-2xl font-bold text-heading">Features per package</h2>
	<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
		<table class="w-full min-w-160 table-fixed border-collapse text-left">
			<thead>
				<tr class="bg-surface-2">
					<th class="w-2/5 px-4 py-3 text-sm font-semibold text-heading">Feature</th>
					{#each tiers as tier (tier)}
						<th class="w-1/5 px-4 py-3 text-sm font-semibold text-heading">{tier}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each comparison as row (row.label)}
					<tr class="border-t border-border">
						<th class="px-4 py-3 text-sm font-medium text-heading">{row.label}</th>
						{#each row.values as value, i (tiers[i])}
							<td
								class="px-4 py-3 text-sm {value === '✓'
									? 'font-semibold text-primary'
									: value === '—'
										? 'text-muted'
										: 'text-heading'}"
							>
								{value}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="border-t border-border bg-surface-2">
					<th class="px-4 py-3 text-sm font-medium text-heading">
						{!annual ? "Monthly" : "Annual"} Price
					</th>
					{#each tiers as tier, t (tier)}
						<td class="px-4 py-3 text-sm tabular-nums">
							<span class="font-semibold text-heading"
								>KES {fmt.format(prices[t] * cycleMultiplier)}</span
							>
							<span class="text-muted">{cycleSuffix}</span>
						</td>
					{/each}
				</tr>
				<!-- Get started row -->
				<tr class="border-t border-border">
					<td class="px-2"></td>
					{#each tiers as tier (tier)}
						<td class="px-4 py-3">
							<a
								href="/onboard/profile"
								class="inline-block rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary transition hover:brightness-95 focus:ring-0 focus:ring-ring focus:outline-none"
							>
								Get started
							</a>
						</td>
					{/each}
				</tr>
			</tfoot>
		</table>
	</div>

	<!-- Monthly / Annual toggle -->
	<div class="mt-8 flex items-center justify-center">
		<div
			class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 p-1"
			role="group"
			aria-label="Billing cycle"
		>
			<button
				type="button"
				aria-pressed={!annual}
				onclick={() => (annual = false)}
				class="rounded-full px-4 py-1.5 text-sm font-semibold transition {!annual
					? 'bg-primary text-on-primary'
					: 'text-muted hover:text-heading'}"
			>
				Monthly
			</button>
			<button
				type="button"
				aria-pressed={annual}
				onclick={() => (annual = true)}
				class="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition {annual
					? 'bg-primary text-on-primary'
					: 'text-muted hover:text-heading'}"
			>
				Annual
				<span
					class="rounded-full px-1.5 py-0.5 text-xs {annual
						? 'bg-on-primary/15 text-on-primary'
						: 'bg-primary-soft text-on-primary'}"
				>
					2 months free
				</span>
			</button>
		</div>
	</div>
	
	<!-- Credits footnote -->
	<div class="mt-4 text-center text-sm text-muted">
		<p>* Credits meter broadcast sends: SMS costs 1 credit, WhatsApp costs 5 credits per message.</p>
	</div>

	<div class="mt-4 text-center">
		<p class="mt-2 text-base">One flat rate, whatever office you're vying for.</p>
		<p class="mt-2 text-base">Your payment helps us verify your candidature against IEBC records, continuously build and maintain our systems and pay for the infrastructure.</p>
		<p class="mt-2 text-base">Your campaign page becomes accessible once it's verified and paid.</p>
	</div>

	<!-- CTA -->
	<div
		class="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-10 text-center text-on-primary"
	>
		<h2 class="text-2xl font-bold text-on-primary">Ready to go public?</h2>

		<div class="mt-4 mx-auto">
			<Countdown />
		</div>

		<p class="mt-4 text-xl font-semibold uppercase tracking-widest text-on-primary">
			10 August 2027
		</p>

	</div>
</section>
