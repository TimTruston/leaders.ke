<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const fmt = new Intl.NumberFormat('en-KE');
	const tierName = data.tier.charAt(0).toUpperCase() + data.tier.slice(1);
	let paying = $state(false);
</script>

<svelte:head><title>Complete Your Payment</title></svelte:head>

<section class="mx-auto max-w-md">
	<h1 class="text-2xl font-bold text-heading">Complete your payment</h1>
	<p class="mt-1 text-sm text-muted">Your page goes live as soon as payment clears.</p>

	{#if form?.error}
		<p class="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{form.error}</p>
	{/if}

	<!-- Order summary -->
	<div class="mt-6 rounded-2xl border border-border bg-surface p-5">
		<dl class="space-y-2 text-sm">
			<div class="flex justify-between"><dt class="text-muted">Profile</dt><dd class="font-medium text-heading">{data.subjectName}</dd></div>
			<div class="flex justify-between"><dt class="text-muted">Package</dt><dd class="font-medium text-heading">{tierName}</dd></div>
			<div class="flex justify-between"><dt class="text-muted">Office</dt><dd class="font-medium text-heading">{data.seatLabel}</dd></div>
			<div class="flex justify-between"><dt class="text-muted">Billing</dt><dd class="font-medium text-heading capitalize">{data.cycle}</dd></div>
		</dl>
		<div class="mt-4 flex items-baseline justify-between border-t border-border pt-4">
			<span class="text-sm font-medium text-heading">Total due</span>
			<span class="text-2xl font-extrabold tabular-nums text-heading">KES {fmt.format(data.amount)}</span>
		</div>
	</div>

	<!-- Mock payment: real Paystack (M-Pesa / card) replaces this block later. -->
	<form method="post" action="?/pay" use:enhance={() => { paying = true; return async ({ update }) => { await update(); paying = false; }; }} class="mt-5">
		<!-- action="?/pay" replaces the page's whole query string on submit, so the
		whole selection (plan + step 3's fields) rides along as one posted field
		instead of relying on the URL surviving. -->
		<input type="hidden" name="passthrough" value={data.passthrough} />
		<p class="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-3 text-xs text-muted">
			Online checkout (Paystack · M-Pesa / card) is being wired up. For now this records your subscription and takes your page live immediately — no card is charged.
		</p>
		<button type="submit" disabled={paying} class="mt-4 w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-50">
			{paying ? 'Processing…' : `Pay KES ${fmt.format(data.amount)}`}
		</button>
	</form>

	<a href={`/onboard/plan?${data.passthrough}`} class="mt-4 block text-center text-sm text-muted hover:text-heading">← Back to plans</a>
</section>
