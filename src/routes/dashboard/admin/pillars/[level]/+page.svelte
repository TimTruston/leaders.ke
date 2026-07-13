<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// One template is editable at a time; null means all rows show read-only.
	let editingId = $state<number | null>(null);
</script>

<svelte:head><title>Pillars — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Pillars</h1>
	<p class="mt-1 text-sm text-muted">
		The starting-point manifesto pillars candidates can pick from, by office level. Picking one
		on their manifesto just prefills the title and summary — it isn't a link back to this list.
	</p>

	<div class="mt-4 overflow-x-auto border-b border-border">
		<div class="flex w-max gap-1">
			{#each data.levels as l (l.slug)}
				<a
					href="/dashboard/admin/pillars/{l.slug}"
					aria-current={l.slug === data.level ? 'page' : undefined}
					class="whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition {l.slug === data.level
						? 'border-primary text-heading'
						: 'border-transparent text-muted hover:text-heading'}"
				>
					{l.title}
				</a>
			{/each}
		</div>
	</div>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<ol class="mt-6 space-y-4">
		{#each data.templates as template, i (template.id)}
			<li class="rounded-2xl border border-border bg-surface p-5">
				{#if editingId === template.id}
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
						<input type="hidden" name="id" value={template.id} />
						<input
							type="text"
							name="title"
							required
							value={template.title}
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
						/>
						<textarea
							name="summary"
							rows="3"
							required
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
							>{template.summary}</textarea
						>
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
							<h3 class="font-semibold text-heading">{template.title}</h3>
							<p class="mt-1 text-sm leading-relaxed text-muted">{template.summary}</p>
						</div>
						<div class="flex shrink-0 gap-1">
							<button
								type="button"
								onclick={() => (editingId = template.id)}
								class="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-heading"
							>
								Edit
							</button>
							<form method="post" action="?/remove" use:enhance>
								<input type="hidden" name="id" value={template.id} />
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
				No {data.levelTitle} pillars yet.
			</li>
		{/each}
	</ol>

	<form method="post" action="?/add" class="mt-8 rounded-2xl border border-border bg-surface-2 p-5" use:enhance>
		<h3 class="font-semibold text-heading">Add a {data.levelTitle} pillar</h3>
		<div class="mt-3 space-y-3">
			<input
				type="text"
				name="title"
				required
				placeholder="Pillar title, e.g. Cost of Living & Jobs"
				class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<textarea
				name="summary"
				rows="3"
				required
				placeholder="Plain-language description a citizen can understand."
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
