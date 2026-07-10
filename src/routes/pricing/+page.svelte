<script lang="ts">
	import Countdown from "$lib/components/Countdown.svelte";

	// Static pricing page driven by the blueprint's rate matrix + package benefits.
	// Prices are monthly KES, keyed by office band (see positions.band: national | regional | ward).

	const tiers = ['Aspirant', 'Influencer', 'Mobilizer'] as const;

	// Rows are office bands; columns line up with `tiers`.
	const priceMatrix = [
		{ office: 'MCA', prices: [1000, 2500, 10000] },
		{ office: 'Governor, Senator, MP, Woman Rep', prices: [3000, 7500, 30000] },
		{ office: 'President & Vice President', prices: [5000, 12500, 50000] },
	];
	// Office selector drives the card prices; index lines up with priceMatrix rows.
	let office = $state(0); // default MCA — the most common aspirant office

	// Card pitch: a short tagline + a few highlight perks per tier. Entry price = the ward (MCA) row.
	const packages = [
		{
			tagline: 'Launch your bid',
			highlights: ['1 campaign page', '1 campaign manager', '100 ambassadors', '10,000 subscriptions']
		},
		{
			tagline: 'Grow your movement',
			highlights: [
				'3 campaign pages',
				'1,000 ambassadors / campaign',
				'IEBC blue-check',
				'Private voter register',
				'Fundraise for campaigns'
			]
		},
		{
			tagline: 'Command the race',
			highlights: [
				'Unlimited everything',
				'Competitor & sentiment analytics',
				'Daily AI audio broadcast',
				'5 GB storage'
			]
		}
	];

	// Base features every package includes.
	const baseFeatures = [
		'Custom leader profile, manifesto & media',
		'Campaign pages, managers and ambassadors',
		'Respond to citizens via email, SMS or WhatsApp',
		'Post on the leaders.ke & tag other leaders',
		'Automatically get tagged in top external news',
		'Create & manage events, polls & pledges',
		'An AI chat on your page, powered by your data',
		'An AI powered audio brief of your profile',
		'Analytics: page views, conversions, pledges'
	];

	// Comparison rows: same metric across all three tiers ("—" means not included).
	const comparison = [
		{ label: 'Campaign pages', values: ['1', '3', 'Unlimited'] },
		{ label: 'Campaign managers', values: ['1', '5', 'Unlimited'] },
		{ label: 'Ambassadors per campaign', values: ['100', '1,000', 'Unlimited'] },
		{ label: 'Citizen subscriptions', values: ['10,000', '1,000,000', 'Unlimited'] },
		{ label: 'File storage', values: ['100 MB', '1 GB', '5 GB'] },
		{ label: 'Events per week', values: ['1', '3', 'Unlimited'] },
		{ label: 'Profile link', values: ['/region/office/name', 'short /name', 'short /name'] },
		{ label: 'IEBC blue-check verification', values: ['—', '✓', '✓'] },
		{ label: 'View, join & create alliances', values: ['—', '✓', '✓'] },
		{ label: 'Private voter register', values: ['—', '✓', '✓'] },
		{ label: 'Public AI chat on profile', values: ['—', '✓', '✓'] },
		{ label: 'Fundraise for campaigns', values: ['—', '✓', '✓'] },
		{ label: 'Version history logs', values: ['—', '—', '✓'] },
		{ label: 'Competitor & alliance metrics', values: ['—', '—', '✓'] },
		{ label: 'Campaign sentiment analysis', values: ['—', '—', '✓'] },
		{ label: 'Trending issues by region', values: ['—', '—', '✓'] },
		{ label: 'Daily AI audio brief broadcast', values: ['—', '—', '✓'] },
		{ label: 'Remove unwanted news tags', values: ['—', '—', '✓'] }
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
		content="leaders.ke subscription pricing: Aspirant, Influencer and Mobilizer packages priced by office."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="text-center">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
			Supercharge your campaign
		</h1>
		<p class="mx-auto mt-4 max-w-xl text-base leading-relaxed">
			Select your office below to view your packages. Hover to explore it.
		</p>
	</div>

	<!-- Office selector: drives the card prices. Scrolls within its track on narrow screens (long labels). -->
	<div class="mt-8 flex flex-col items-center gap-2 pb-4">
		<div class="w-full overflow-x-auto">
			<div
				class="mx-auto flex w-max items-center gap-1 rounded-full border border-border bg-surface-2 p-1"
				role="group"
				aria-label="Office"
			>
				{#each priceMatrix as row, o (row.office)}
					<button
						type="button"
						aria-pressed={office === o}
						onclick={() => (office = o)}
						class="rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap transition {office === o
							? 'bg-primary text-on-primary'
							: 'text-muted hover:text-heading'}"
					>
						{priceMatrix[o].office}
					</button>
				{/each}
			</div>
		</div>
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
						KES {fmt.format(priceMatrix[office].prices[t] * cycleMultiplier)}
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
					href="/signup"
					tabindex={active === t ? 0 : -1}
					aria-hidden={active === t ? undefined : 'true'}
					class="mt-6 rounded-full bg-primary px-4 py-2.5 text-center font-semibold text-on-primary transition-all duration-300 hover:brightness-95 focus:ring-2 focus:ring-ring focus:outline-none {active ===
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
				<!-- Price row: reflects the selected office + billing cycle -->
				<tr class="border-t border-border bg-surface-2">
					<th class="px-4 py-3 text-sm font-medium text-heading">
						<!-- Office selector: drives the card prices -->
						{!annual ? "Monthly" : "Annual"} Price
					</th>
					{#each tiers as tier, t (tier)}
						<td class="px-4 py-3 text-sm tabular-nums">
							<span class="font-semibold text-heading"
								>KES {fmt.format(priceMatrix[office].prices[t] * cycleMultiplier)}</span
							>
							<span class="text-muted">{cycleSuffix}</span>
						</td>
					{/each}
				</tr>
				<!-- Get started row -->
				<tr class="border-t border-border">
					<td class="px-2">
						<select
								bind:value={office}
								aria-label="Office"
								class="rounded-full border border-border bg-surface-1 pl-4 pr-8 py-2 text-sm font-semibold text-on-primary focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
							>
							{#each priceMatrix as row, o (row.office)}
								<option value={o}>Vying for {row.office}</option>
							{/each}
						</select>
					</td>
					{#each tiers as tier (tier)}
						<td class="px-4 py-3">
							<a
								href="/signup"
								class="inline-block rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary transition hover:brightness-95 focus:ring-2 focus:ring-ring focus:outline-none"
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
	
	<!-- Price by office -->
	<div class="mt-4 text-center">
		<p class="mt-2 text-base">Packages are priced by the office you're vying for.</p>
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
