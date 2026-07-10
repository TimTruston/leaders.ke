<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// One pillar is editable at a time; null means all rows show read-only.
	let editingId = $state<number | null>(null);
</script>

<svelte:head><title>Manifesto — leaders.ke</title></svelte:head>

<div class="">
	<h2 class="text-lg font-semibold text-heading">Manifesto</h2>
	<p class="mt-1 text-sm text-muted">
		The pillars citizens see on your public page, in the order you add them.
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<!-- Existing pillars -->
	<ol class="mt-6 space-y-4">
		{#each data.pillars as pillar, i (pillar.id)}
			<li class="rounded-2xl border border-border bg-surface p-5">
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
						<div class="grid gap-3 sm:grid-cols-2">
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
						<span
							class="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary"
						>
							{i + 1}
						</span>
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
						<div class="flex shrink-0 gap-1">
							<button
								type="button"
								onclick={() => (editingId = pillar.id)}
								class="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-heading"
							>
								Edit
							</button>
							<form method="post" action="?/remove" use:enhance>
								<input type="hidden" name="pillarId" value={pillar.id} />
								<button
									type="submit"
									class="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-heading"
								>
									Delete
								</button>
							</form>
						</div>
					</div>
				{/if}
			</li>
		{:else}
			<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
				No pillars yet. Add the first promise citizens should hold you to.
			</li>
		{/each}
	</ol>

	<!-- Add pillar -->
	<form method="post" action="?/add" class="mt-8 rounded-2xl border border-border bg-surface-2 p-5" use:enhance>
		<h3 class="font-semibold text-heading">Add a pillar</h3>
		<div class="mt-3 space-y-3">
			<input
				type="text"
				name="title"
				required
				placeholder="Pillar title, e.g. Water for all"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<textarea
				name="summary"
				rows="3"
				required
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
