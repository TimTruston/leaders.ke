<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
</script>

<svelte:head><title>Subscriptions &amp; revenue — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Subscriptions &amp; revenue</h1>
	<p class="mt-1 text-sm text-muted">Every campaign subscription, and what's actually been collected.</p>

	<div class="mt-6 grid gap-4 sm:grid-cols-2">
		<div class="rounded-2xl border border-border bg-surface p-5">
			<p class="text-sm text-muted">Revenue this month</p>
			<p class="mt-1 text-2xl font-bold text-heading">KES {fmt.format(data.revenue.totalThisMonth)}</p>
		</div>
		<div class="rounded-2xl border border-border bg-surface p-5">
			<p class="text-sm text-muted">Revenue all-time</p>
			<p class="mt-1 text-2xl font-bold text-heading">KES {fmt.format(data.revenue.totalAllTime)}</p>
		</div>
	</div>

	{#if data.subscriptions.length > 0}
		<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-200 border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="px-4 py-3 text-sm font-semibold text-heading">Campaign</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Payer</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Tier</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Cycle</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Amount</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Status</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Ends</th>
					</tr>
				</thead>
				<tbody>
					{#each data.subscriptions as sub (sub.id)}
						<tr class="border-t border-border">
							<td class="px-4 py-3 text-sm text-heading">{sub.campaignLeaderName}</td>
							<td class="px-4 py-3 text-sm text-muted">{sub.payerName}</td>
							<td class="px-4 py-3 text-sm capitalize text-muted">{sub.tier}</td>
							<td class="px-4 py-3 text-sm capitalize text-muted">{sub.billingCycle}</td>
							<td class="px-4 py-3 text-sm tabular-nums text-muted">KES {fmt.format(sub.amount)}</td>
							<td class="px-4 py-3 text-sm">
								<span
									class="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {sub.status === 'active'
										? 'bg-primary-soft text-on-primary'
										: 'bg-surface-2 text-muted'}"
								>
									{sub.status}
								</span>
							</td>
							<td class="px-4 py-3 text-sm text-muted">{dateFmt.format(new Date(sub.endsAt))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="mt-6 text-sm text-muted">No subscriptions yet.</p>
	{/if}
</div>
