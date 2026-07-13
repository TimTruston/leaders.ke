<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// One pillar is editable at a time; null means all rows show read-only.
	let editingId = $state<number | null>(null);

	// Picking a template just prefills these — it isn't a link back to the template.
	let newTitle = $state('');
	let newSummary = $state('');
	// Svelte binds <option value={number}> as the actual number (not its string form),
	// so this has to stay a number to match — comparing via String() never found a hit.
	let selectedTemplateId = $state<number | ''>('');

	function onTemplateChange() {
		const template = data.templates.find((t) => t.id === selectedTemplateId);
		newTitle = template?.title ?? '';
		newSummary = template?.summary ?? '';
	}

	// Local, reorderable copy of the list — reordered on drop before the server
	// round-trip finishes, so dragging feels instant. Resyncs whenever the server
	// data changes underneath it (add/edit/delete, or the reorder save itself).
	let orderedPillars = $state(data.pillars);
	$effect(() => {
		orderedPillars = data.pillars;
	});

	let dragIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function onDragStart(i: number) {
		dragIndex = i;
	}
	function onDragOver(e: DragEvent, i: number) {
		e.preventDefault();
		dragOverIndex = i;
	}
	function onDragEnd() {
		dragIndex = null;
		dragOverIndex = null;
	}
	async function onDrop(i: number) {
		dragOverIndex = null;
		const from = dragIndex;
		dragIndex = null;
		if (from === null || from === i) return;

		const next = [...orderedPillars];
		const [moved] = next.splice(from, 1);
		next.splice(i, 0, moved);
		orderedPillars = next;

		const body = new FormData();
		body.set('order', next.map((p) => p.id).join(','));
		await fetch('?/reorder', { method: 'POST', body });
		await invalidateAll();
	}
</script>

<svelte:head><title>Manifesto — leaders.ke</title></svelte:head>

<div class="">
	<h2 class="text-lg font-semibold text-heading">Manifesto</h2>
	<p class="mt-1 text-sm text-muted">
		The promises that citizens see on your public page, in the order you add them. {#if data.pillars?.length > 1} Drag to reorder. {/if}
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<!-- Existing pillars -->
	<ol class="mt-6 space-y-4">
		{#each orderedPillars as pillar, i (pillar.id)}
			<li
				draggable={editingId === null}
				ondragstart={() => onDragStart(i)}
				ondragover={(e) => onDragOver(e, i)}
				ondrop={() => onDrop(i)}
				ondragend={onDragEnd}
				class="flex items-start gap-2 rounded-2xl border bg-surface p-5 transition {dragOverIndex === i && dragIndex !== null && dragIndex !== i
					? 'border-primary'
					: 'border-border'}"
			>
				<div class="min-w-0 flex-1">
				{#if editingId === pillar.id}
					<form
						method="post"
						action="?/update"
						class="space-y-3"
						use:enhance={() => {
							return async ({ update }) => {
								editingId = null;
								await update();
							};
						}}
					>
						<input type="hidden" name="pillarId" value={pillar.id} />
						<input
							type="text"
							name="title"
							required
							value={pillar.title}
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
						/>
						<textarea
							name="summary"
							rows="3"
							required
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
							>{pillar.summary}</textarea
						>
						<!-- Public delivery tracker: status + verifiable evidence -->
						<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
							<label class="block">
								<span class="text-xs font-medium text-muted">Delivery status (public)</span>
								<select
									name="deliveryStatus"
									value={pillar.deliveryStatus}
									class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
								>
									<option value="promised">Promised</option>
									<option value="in_progress">In progress</option>
									<option value="delivered">Delivered</option>
								</select>
							</label>
							<label class="block">
								<span class="text-xs font-medium text-muted">Evidence (public, optional)</span>
								<input
									type="text"
									name="evidence"
									value={pillar.evidence}
									placeholder="e.g. 7 of 10 dispensaries built"
									class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
								/>
							</label>
						</div>
						<div class="flex gap-2">
							<button
								type="submit"
								class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
							>
								Save
							</button>
							<button
								type="button"
								onclick={() => (editingId = null)}
								class="rounded-full border border-border px-4 py-2 text-sm font-semibold text-heading transition hover:bg-surface-2"
							>
								Cancel
							</button>
						</div>
					</form>
				{:else}
					<div class="flex items-start gap-3">
						<div class="flex flex-col items-center">
							<span
								class="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary"
							>{i + 1}</span>
							{#if editingId === null}
								<span
									class="shrink-0 cursor-grab select-none text-muted"
									aria-hidden="true"
									title="Drag to reorder"
								>⠿</span>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="flex flex-wrap items-center gap-2 font-semibold text-heading">
								{pillar.title}
								<span
									class="rounded-full px-2 py-0.5 text-xs font-semibold {pillar.deliveryStatus ===
									'delivered'
										? 'bg-primary text-on-primary'
										: pillar.deliveryStatus === 'in_progress'
											? 'bg-primary-soft text-on-primary'
											: 'border border-border bg-surface-2 text-muted'}"
								>
									{pillar.deliveryStatus === 'in_progress'
										? 'In progress'
										: pillar.deliveryStatus === 'delivered'
											? 'Delivered'
											: 'Promised'}
								</span>
							</h3>
							<p class="mt-1 text-sm leading-relaxed">{pillar.summary}</p>
							{#if pillar.evidence}
								<p class="mt-1 text-xs text-muted">Evidence: {pillar.evidence}</p>
							{/if}
						</div>
						<div class="flex flex-col shrink-0">
							<button
								type="button"
								onclick={() => (editingId = pillar.id)}
								class="rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-heading"
							>
								Edit
							</button>
							<form method="post" action="?/remove" use:enhance>
								<input type="hidden" name="pillarId" value={pillar.id} />
								<button
									type="submit"
									class="rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-heading"
								>
									Delete
								</button>
							</form>
						</div>
					</div>
				{/if}
				</div>
			</li>
		{:else}
			<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
				Add the first promise citizens should hold you to.
			</li>
		{/each}
	</ol>

	<!-- Add pillar -->
	<form
		method="post"
		action="?/add"
		class="mt-8 rounded-2xl border border-border bg-surface-2 p-5"
		use:enhance={() => {
			return async ({ update }) => {
				newTitle = '';
				newSummary = '';
				selectedTemplateId = '';
				await update();
			};
		}}
	>
		<h3 class="font-semibold text-heading">Add Pillars</h3>
		<div class="mt-3 space-y-3">
			{#if data.templates.length > 0}
				<label class="flex gap-4 items-center">
					<p class="text-sm font-medium text-muted">Templates</p>
					<select
						bind:value={selectedTemplateId}
						onchange={onTemplateChange}
						class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
					>
						<option value="">Write your own</option>
						{#each data.templates as template (template.id)}
							<option value={template.id}>{template.title}</option>
						{/each}
					</select>
				</label>
			{/if}
			<input
				type="text"
				name="title"
				required
				bind:value={newTitle}
				placeholder="Pillar title, e.g. Water for all"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<textarea
				name="summary"
				rows="3"
				required
				bind:value={newSummary}
				placeholder="What you will do, stated so a citizen can verify it later."
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			></textarea>
			<button
				type="submit"
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Add pillar
			</button>
		</div>
	</form>
</div>
