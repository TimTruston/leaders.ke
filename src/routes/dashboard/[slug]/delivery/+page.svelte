<script lang="ts">
	import { enhance } from '$app/forms';
	import ExperienceBlock from '$lib/components/ExperienceBlock.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let saving = $state(false);

	type PendingDelivery = { leaderId: number; title: string; description: string };
	let pendingDeliveries = $state<PendingDelivery[]>([]);
	let removedDeliveryIds = $state<number[]>([]);

	const visibleExisting = $derived(data.deliveries.filter((d) => !removedDeliveryIds.includes(d.id)));

	// Add-form fields, scoped to whichever term is selected.
	let addTermId = $state<number | ''>(data.terms[0]?.id ?? '');
	let addTitle = $state('');
	let addDescription = $state('');

	function addDelivery() {
		if (!addTermId || !addTitle.trim()) return;
		pendingDeliveries.push({ leaderId: addTermId, title: addTitle.trim(), description: addDescription.trim() });
		addTitle = '';
		addDescription = '';
	}
	function removePending(i: number) {
		pendingDeliveries.splice(i, 1);
	}
	function removeExisting(id: number) {
		removedDeliveryIds.push(id);
	}

	// Grouped by term, most recent first (data.terms already arrives in that order).
	const groups = $derived(
		data.terms.map((t) => ({
			term: t,
			existing: visibleExisting.filter((d) => d.leaderId === t.id),
			pending: pendingDeliveries.map((d, i) => ({ ...d, i })).filter((d) => d.leaderId === t.id)
		}))
	);
</script>

<svelte:head><title>Delivery — leaders.ke</title></svelte:head>

<div>
	<h2 class="text-xl font-bold text-heading">Delivery</h2>
	<p class="text-sm text-muted">List what you delivered under each of your terms — citizens see this on your public profile.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
	{:else if form?.saved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Saved.</div>
	{/if}

	{#if data.terms.length === 0}
		<p class="mt-8 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
			Add a term on the Leader tab's "+ Elected" first — Delivery is listed per term.
		</p>
	{:else}
		<form
			method="post"
			action="?/save"
			class="mt-6 space-y-6"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					saving = false;
					pendingDeliveries = [];
					removedDeliveryIds = [];
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="deliveryEntries" value={JSON.stringify(pendingDeliveries)} />
			<input type="hidden" name="removedDeliveryIds" value={JSON.stringify(removedDeliveryIds)} />

			{#each groups as group (group.term.id)}
				<div class="rounded-2xl border border-border bg-surface p-5">
					<h3 class="font-semibold text-heading">
						{group.term.label}
						<span class="ml-1 text-sm font-normal text-muted">({group.term.from}–{group.term.to ?? 'present'})</span>
					</h3>
					{#if group.existing.length === 0 && group.pending.length === 0}
						<p class="mt-2 text-sm text-muted">Nothing listed yet for this term.</p>
					{:else}
						<ul class="mt-3 space-y-2">
							{#each group.existing as item (item.id)}
								<ExperienceBlock title={item.title} description={item.description} dateLabel="" onRemove={() => removeExisting(item.id)} />
							{/each}
							{#each group.pending as item (item.i)}
								<ExperienceBlock title={item.title} description={item.description} dateLabel="" unsaved pending onRemove={() => removePending(item.i)} />
							{/each}
						</ul>
					{/if}
				</div>
			{/each}

			<div class="rounded-2xl border border-border bg-surface-2 p-5">
				<h3 class="font-semibold text-heading">Add a delivery</h3>
				<div class="mt-3 space-y-3">
					<label class="block">
						<span class="text-sm font-medium text-heading">Term</span>
						<select bind:value={addTermId} class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none">
							{#each data.terms as t (t.id)}
								<option value={t.id}>{t.label} ({t.from}–{t.to ?? 'present'})</option>
							{/each}
						</select>
					</label>
					<label class="block">
						<span class="text-sm font-medium text-heading">Title</span>
						<input
							type="text"
							bind:value={addTitle}
							placeholder="Built 12km of tarmac road"
							class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
					</label>
					<label class="block">
						<span class="text-sm font-medium text-heading">Description</span>
						<textarea
							bind:value={addDescription}
							maxlength="1000"
							rows="3"
							placeholder="Optional: details, numbers, or a link to evidence"
							class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						></textarea>
					</label>
					<button
						type="button"
						onclick={addDelivery}
						disabled={!addTermId || !addTitle.trim()}
						class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
					>
						Add delivery
					</button>
				</div>
			</div>

			<button
				type="submit"
				disabled={saving}
				class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{saving ? 'Saving…' : 'Save delivery'}
			</button>
		</form>
	{/if}
</div>
