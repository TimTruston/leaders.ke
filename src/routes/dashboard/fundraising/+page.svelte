<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });

	const progress = $derived(
		data.goal > 0 ? Math.min(100, Math.round((data.raised / data.goal) * 100)) : 0
	);
</script>

<svelte:head><title>Fundraising — leaders.ke</title></svelte:head>

{#if form?.error}
	<div class="mb-6  rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
		{form.error}
	</div>
{/if}

<div class="grid gap-8 lg:grid-cols-5">
	<!-- Goal + progress -->
	<div class="lg:col-span-2">
		<h2 class="text-lg font-semibold text-heading">Campaign fund</h2>
		<p class="mt-1 text-sm text-muted">
			Confirmed donations count toward the public goal thermometer on your campaign page.
		</p>

		<div class="mt-4 rounded-2xl border border-border bg-surface p-5">
			<p class="text-3xl font-extrabold tabular-nums text-heading">
				KES {fmt.format(data.raised)}
			</p>
			<p class="mt-1 text-sm text-muted">
				{#if data.goal > 0}
					of KES {fmt.format(data.goal)} goal ({progress}%)
				{:else}
					raised (no public goal set)
				{/if}
			</p>
			{#if data.goal > 0}
				<div class="mt-3 h-3 overflow-hidden rounded-full bg-surface-2">
					<div class="h-full rounded-full bg-primary" style="width: {progress}%"></div>
				</div>
			{/if}
		</div>

		<form method="post" action="?/setGoal" class="mt-4 flex flex-wrap gap-2" use:enhance>
			<input
				type="number"
				name="goal"
				min="0"
				step="1000"
				value={data.goal || ''}
				placeholder="Goal in KES"
				class="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<button
				type="submit"
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Set goal
			</button>
		</form>

		<div class="mt-6 rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed text-muted">
			Donors currently pledge on your public page and pay via M-Pesa directly; confirm each
			donation against your statement below. Automatic M-Pesa STK push arrives with the payments
			integration.
		</div>
	</div>

	<!-- Donation ledger -->
	<div class="lg:col-span-3">
		<h2 class="text-lg font-semibold text-heading">
			Donations <span class="text-sm font-normal text-muted">({data.donations.length})</span>
		</h2>

		<ul class="mt-4 space-y-3">
			{#each data.donations as donation (donation.id)}
				<li class="rounded-2xl border border-border bg-surface p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="font-medium text-heading">
								{donation.donorName}
								<span class="ml-1 text-sm font-bold text-primary">KES {fmt.format(donation.amount)}</span>
							</p>
							<p class="text-xs text-muted">
								{donation.phoneNumber ?? 'no phone'} · {dateFmt.format(new Date(donation.createdAt))}
								{#if donation.reference}· ref {donation.reference}{/if}
							</p>
						</div>
						<span
							class="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {donation.status ===
							'confirmed'
								? 'bg-primary text-on-primary'
								: donation.status === 'pending'
									? 'bg-primary-soft text-on-primary'
									: 'border border-border bg-surface-2 text-muted'}"
						>
							{donation.status}
						</span>
					</div>

					{#if donation.status === 'pending'}
						<div class="mt-3 flex flex-wrap gap-2">
							<form method="post" action="?/confirm" class="flex flex-wrap gap-2" use:enhance>
								<input type="hidden" name="donationId" value={donation.id} />
								<input
									type="text"
									name="reference"
									placeholder="M-Pesa receipt (optional)"
									class="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:outline-none"
								/>
								<button
									type="submit"
									class="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
								>
									Confirm received
								</button>
							</form>
							<form method="post" action="?/markFailed" use:enhance>
								<input type="hidden" name="donationId" value={donation.id} />
								<button
									type="submit"
									class="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
								>
									Mark failed
								</button>
							</form>
						</div>
					{/if}
				</li>
			{:else}
				<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
					No donations yet. The donate card on your campaign page feeds this ledger.
				</li>
			{/each}
		</ul>
	</div>
</div>
