<script lang="ts">
	import { enhance } from '$app/forms';
	import ExperienceBlock from '$lib/components/ExperienceBlock.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let adding = $state(false);
	let removingId = $state<number | null>(null);
	// One form ref per delivery row, keyed by id, so onRemove (no args, per
	// ExperienceBlock's contract) can trigger that row's own hidden form.
	let removeFormEls: Record<number, HTMLFormElement | null> = $state({});

	// Add-form fields, scoped to whichever target (a term or a non-elective
	// experience — see data.targets) is selected. Reset after each successful add.
	let addTarget = $state<string>(data.targets[0]?.target ?? '');
	let addTitle = $state('');
	let addDescription = $state('');

	// Grouped by target, in the order data.targets arrives (terms first, most
	// recent first, then experience entries).
	const groups = $derived(data.targets.map((t) => ({ target: t, items: data.deliveries.filter((d) => d.target === t.target) })));
</script>

<svelte:head><title>Delivery — leaders.ke</title></svelte:head>

<div>
	<h2 class="text-xl font-bold text-heading">Delivery</h2>
	<p class="text-sm text-muted">List what you delivered under each of your terms or roles — citizens see this on your public profile.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
	{/if}

	{#if data.targets.length === 0}
		<p class="mt-8 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
			Add a term ("+ Elected") or a professional role on the Leader tab first — Delivery is listed against one of those.
		</p>
	{:else}
		<div class="mt-6 space-y-6">
			{#each groups as group (group.target.target)}
				<div class="rounded-2xl border border-border bg-surface p-5">
					<h3 class="font-semibold text-heading">
						{group.target.label}
						<span class="ml-1 text-sm font-normal text-muted">({group.target.from ?? '—'}–{group.target.to ?? 'present'})</span>
					</h3>
					{#if group.items.length === 0}
						<p class="mt-2 text-sm text-muted">Nothing listed yet.</p>
					{:else}
						<ul class="mt-3 space-y-2">
							{#each group.items as item (item.id)}
								<form
									method="post"
									action="?/remove"
									bind:this={removeFormEls[item.id]}
									use:enhance={() => {
										removingId = item.id;
										return async ({ update }) => {
											removingId = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="id" value={item.id} />
									<ExperienceBlock
										title={item.title}
										description={item.description}
										dateLabel={removingId === item.id ? 'Removing…' : ''}
										onRemove={() => removeFormEls[item.id]?.requestSubmit()}
									/>
								</form>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}

			<div class="rounded-2xl border border-border bg-surface-2 p-5">
				<h3 class="font-semibold text-heading">Add a delivery</h3>
				<form
					method="post"
					action="?/add"
					class="mt-3 space-y-3"
					use:enhance={() => {
						adding = true;
						return async ({ result, update }) => {
							adding = false;
							if (result.type === 'success') {
								addTitle = '';
								addDescription = '';
							}
							await update({ reset: false });
						};
					}}
				>
					<label class="block">
						<span class="text-sm font-medium text-heading">Term or role</span>
						<select name="target" bind:value={addTarget} class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none">
							{#each data.targets as t (t.target)}
								<option value={t.target}>{t.label} ({t.from ?? '—'}–{t.to ?? 'present'})</option>
							{/each}
						</select>
					</label>
					<label class="block">
						<span class="text-sm font-medium text-heading">Title</span>
						<input
							type="text"
							name="title"
							bind:value={addTitle}
							placeholder="Built 12km of tarmac road"
							class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
					</label>
					<label class="block">
						<span class="text-sm font-medium text-heading">Description</span>
						<textarea
							name="description"
							bind:value={addDescription}
							maxlength="1000"
							rows="3"
							placeholder="Optional: details, numbers, or a link to evidence"
							class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						></textarea>
					</label>
					<button
						type="submit"
						disabled={!addTarget || !addTitle.trim() || adding}
						class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
					>
						{adding ? 'Adding…' : 'Add delivery'}
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
