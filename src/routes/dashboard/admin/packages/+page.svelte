<script lang="ts">
	// Mirrors the public pricing page's "Features per package" layout, one table
	// per seat band (National / Regional / Ward): tiers as columns, a row per
	// price or cap. Every cell saves on change; an empty cap means unlimited.
	// Seed values come from src/lib/data/packages.json (bun run db:seed -- --packages).
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const TIERS = ['aspirant', 'influencer', 'mobilizer'] as const;
	const CYCLES = ['monthly', 'annual'] as const;
	// Band labels spell out which offices each rate band covers (schema: priceBandEnum).
	const BANDS = [
		{ key: 'national', label: 'National seats', offices: 'President, Deputy President' },
		{ key: 'regional', label: 'Regional seats', offices: 'Governor, Senator, Woman Rep, MP' },
		{ key: 'ward', label: 'Ward seats', offices: 'MCA' }
	] as const;
	const FEATURES = [
		{ key: 'pages', label: 'Campaign pages' },
		{ key: 'managers', label: 'Campaign managers' },
		{ key: 'ambassadors', label: 'Ambassadors' },
		{ key: 'subscriptions', label: 'Citizen subscriptions' },
		{ key: 'storageMb', label: 'Storage (MB)' },
		{ key: 'eventsPerWeek', label: 'Events per week' }
	] as const;

	const rate = (band: string, tier: string, cycle: string) =>
		data.pricing.find((p) => p.band === band && p.tier === tier && p.billingCycle === cycle);
	const pkg = (band: string, tier: string) =>
		data.packages.find((p) => p.band === band && p.tier === tier);

	// Autosave a cell when its value changes (blur/Enter) — no per-cell buttons.
	const submitOnChange = (e: Event) => (e.currentTarget as HTMLInputElement).form?.requestSubmit();

	const inputClass =
		'w-28 rounded-full border border-border bg-surface px-3 py-1 text-sm tabular-nums text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none';
</script>

<svelte:head><title>Packages — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Packages</h1>
	<p class="mt-1 text-sm text-muted">
		What each package costs and includes, per seat level. Edits save when you leave a field; an
		empty cap means unlimited. Rate changes never touch existing subscriptions, they only apply
		going forward.
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{:else if form?.updated}
		<div class="mt-4 rounded-2xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Saved.</div>
	{/if}

	<!-- Platform-wide caps that aren't per band -->
	<h2 class="mt-8 text-lg font-semibold text-heading">All seat levels</h2>
	<div class="mt-3 overflow-x-auto rounded-2xl border border-border">
		<table class="w-full min-w-160 table-fixed border-collapse text-left">
			<thead>
				<tr class="bg-surface-2">
					<th class="w-2/5 px-4 py-3 text-sm font-semibold text-heading">Package includes</th>
					{#each TIERS as tier (tier)}
						<th class="w-1/5 px-4 py-3 text-sm font-semibold text-heading capitalize">{tier}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				<!-- Lifetime invites: a single jsonb setting — the inputs sit in their own
				cells but submit together via the #invite-limits form below the tables. -->
				<tr class="border-t border-border">
					<th class="px-4 py-3 text-sm font-medium text-heading">
						Lifetime invites per campaign
						<span class="mt-0.5 block text-xs font-normal text-muted">
							Total team/follower invites a campaign may ever send
						</span>
					</th>
					{#each TIERS as tier (tier)}
						<td class="px-4 py-3">
							<input
								type="number"
								form="invite-limits"
								name={tier}
								min="1"
								value={data.inviteLimits[tier]}
								onchange={submitOnChange}
								aria-label="{tier} lifetime invites"
								class={inputClass}
							/>
						</td>
					{/each}
				</tr>
			</tbody>
		</table>
	</div>

	<!-- One table per seat band: prices then caps, tiers as columns -->
	{#each BANDS as band (band.key)}
		<h2 class="mt-8 text-lg font-semibold text-heading">{band.label}</h2>
		<p class="text-xs text-muted">{band.offices}</p>
		<div class="mt-3 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-160 table-fixed border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="w-2/5 px-4 py-3 text-sm font-semibold text-heading">Package includes</th>
						{#each TIERS as tier (tier)}
							<th class="w-1/5 px-4 py-3 text-sm font-semibold text-heading capitalize">{tier}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each CYCLES as cycle (cycle)}
						<tr class="border-t border-border">
							<th class="px-4 py-3 text-sm font-medium text-heading capitalize">{cycle} price (KES)</th>
							{#each TIERS as tier (tier)}
								{@const current = rate(band.key, tier, cycle)}
								<td class="px-4 py-3">
									<form method="post" action="?/setRate" use:enhance>
										<input type="hidden" name="band" value={band.key} />
										<input type="hidden" name="tier" value={tier} />
										<input type="hidden" name="billingCycle" value={cycle} />
										<input
											type="number"
											name="amount"
											min="1"
											value={current?.amount ?? ''}
											placeholder="—"
											onchange={submitOnChange}
											aria-label="{band.label} {cycle} {tier} rate in KES"
											class={inputClass}
										/>
									</form>
								</td>
							{/each}
						</tr>
					{/each}
					{#each FEATURES as feature (feature.key)}
						<tr class="border-t border-border">
							<th class="px-4 py-3 text-sm font-medium text-heading">{feature.label}</th>
							{#each TIERS as tier (tier)}
								{@const features = pkg(band.key, tier)?.features}
								<td class="px-4 py-3">
									<form method="post" action="?/setFeature" use:enhance>
										<input type="hidden" name="band" value={band.key} />
										<input type="hidden" name="tier" value={tier} />
										<input type="hidden" name="key" value={feature.key} />
										<input
											type="number"
											name="value"
											min="0"
											value={features?.[feature.key] ?? ''}
											placeholder="Unlimited"
											onchange={submitOnChange}
											aria-label="{band.label} {tier} {feature.label}"
											class={inputClass}
										/>
									</form>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}

	<!-- Owns the invite-limit inputs above (via form="invite-limits") so the three
	tier caps submit together as the single jsonb setting they are. -->
	<form id="invite-limits" method="post" action="?/saveInviteLimits" use:enhance></form>
</div>
