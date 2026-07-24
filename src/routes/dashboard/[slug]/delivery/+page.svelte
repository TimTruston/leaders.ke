<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let adding = $state(false);
	let removingId = $state<number | null>(null);
	let pinningId = $state<number | null>(null);

	// Add-form fields, scoped to whichever target (a term or a non-elective
	// experience — see data.targets) is selected. Reset after each successful add.
	let addTarget = $state<string>(data.targets[0]?.target ?? '');
	let addTitle = $state('');
	let addDescription = $state('');

	// Grouped by target, in the order data.targets arrives (terms first, most
	// recent first, then experience entries).
	const groups = $derived(data.targets.map((t) => ({ target: t, items: data.deliveries.filter((d) => d.target === t.target) })));
	const atPinCap = $derived(data.pinnedCount >= data.maxPinned);
</script>

<svelte:head><title>Delivery — leaders.ke</title></svelte:head>

<div>
	<h2 class="text-xl font-bold text-heading">Delivery</h2>
	<p class="text-sm text-muted">
		What you've already delivered under each of your terms or roles — this is the past, described and proven.
		For promises and plans, use the Campaign tab instead.
	</p>
	<p class="mt-1 text-sm font-medium text-heading">
		Pinned {data.pinnedCount}/{data.maxPinned} — only pinned deliveries show on your public profile.
	</p>

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
				<details class="group rounded-2xl border border-border bg-surface p-5" open={groups.length === 1}>
					<summary class="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-heading">
						<span>
							{group.target.label}
							<span class="ml-1 text-sm font-normal text-muted">({group.target.from ?? '—'}–{group.target.to ?? 'present'})</span>
						</span>
						<span class="flex shrink-0 items-center gap-2">
							<span class="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted">{group.items.length}</span>
							<span class="text-muted transition group-open:rotate-180">▾</span>
						</span>
					</summary>
					{#if group.items.length === 0}
						<p class="mt-2 text-sm text-muted">Nothing listed yet.</p>
					{:else}
						<ul class="mt-3 space-y-2">
							{#each group.items as item (item.id)}
								<li class="rounded-xl border px-4 py-3 text-sm {item.pinned ? 'border-primary/40 bg-primary-soft/20' : 'border-transparent bg-surface-2'}">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="font-medium text-heading">
												{item.title}
												{#if item.pinned}<span class="ml-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary">Pinned</span>{/if}
											</p>
											{#if item.description}<p class="mt-1 text-muted">{item.description}</p>{/if}
										</div>
									</div>
									<div class="mt-2 flex gap-4 text-xs">
										<form
											method="post"
											action="?/togglePin"
											use:enhance={() => {
												pinningId = item.id;
												return async ({ update }) => {
													pinningId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="id" value={item.id} />
											<button
												type="submit"
												disabled={(!item.pinned && atPinCap) || pinningId === item.id}
												title={!item.pinned && atPinCap ? `You've pinned ${data.maxPinned} already — unpin one first.` : ''}
												class="font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
											>
												{pinningId === item.id ? 'Saving…' : item.pinned ? 'Unpin' : 'Pin'}
											</button>
										</form>
										<form
											method="post"
											action="?/remove"
											use:enhance={() => {
												removingId = item.id;
												return async ({ update }) => {
													removingId = null;
													await update();
												};
											}}
										>
											<input type="hidden" name="id" value={item.id} />
											<button type="submit" disabled={removingId === item.id} class="font-semibold text-muted hover:text-heading">
												{removingId === item.id ? 'Removing…' : 'Remove'}
											</button>
										</form>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</details>
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
