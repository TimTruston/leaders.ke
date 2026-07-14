<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');
	const BANDS = ['national', 'regional', 'ward'];
	const TIERS = ['aspirant', 'influencer', 'mobilizer'];
	const CYCLES = ['monthly', 'annual'];
</script>

<svelte:head><title>Packages — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Packages</h1>
	<p class="mt-1 text-sm text-muted">
		The subscription rate card. Changing a rate doesn't touch existing subscriptions, it only
		applies going forward.
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
		<table class="w-full min-w-160 border-collapse text-left">
			<thead>
				<tr class="bg-surface-2">
					<th class="px-4 py-3 text-sm font-semibold text-heading">Band</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Tier</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Cycle</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Current rate</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">New rate</th>
				</tr>
			</thead>
			<tbody>
				{#each BANDS as band (band)}
					{#each TIERS as tier (tier)}
						{#each CYCLES as cycle (cycle)}
							{@const current = data.pricing.find((p) => p.band === band && p.tier === tier && p.billingCycle === cycle)}
							<tr class="border-t border-border">
								<td class="px-4 py-3 text-sm capitalize text-heading">{band}</td>
								<td class="px-4 py-3 text-sm capitalize text-muted">{tier}</td>
								<td class="px-4 py-3 text-sm capitalize text-muted">{cycle}</td>
								<td class="px-4 py-3 text-sm tabular-nums text-muted">
									{current ? `KES ${fmt.format(current.amount)}` : '—'}
								</td>
								<td class="px-4 py-3">
									<form method="post" action="?/setRate" class="flex items-center gap-2" use:enhance>
										<input type="hidden" name="band" value={band} />
										<input type="hidden" name="tier" value={tier} />
										<input type="hidden" name="billingCycle" value={cycle} />
										<input
											type="number"
											name="amount"
											min="1"
											placeholder={current ? String(current.amount) : 'KES'}
											class="w-28 rounded-full border border-border bg-surface px-3 py-1 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
										/>
										<button
											type="submit"
											class="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
										>
											Update
										</button>
									</form>
								</td>
							</tr>
						{/each}
					{/each}
				{/each}
			</tbody>
		</table>
	</div>
</div>
