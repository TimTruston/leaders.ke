<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-KE');
</script>

<svelte:head><title>Endorsements — leaders.ke</title></svelte:head>

{#if form?.error}
	<div class="mb-6  rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
		{form.error}
	</div>
{/if}

<div class="mb-8 rounded-2xl border border-border bg-surface p-5">
	<p class="text-3xl font-extrabold tabular-nums text-heading">{fmt.format(data.pledgeCount)}</p>
	<p class="mt-1 text-sm text-muted">
		Citizens have pledged their vote on your campaign page. Pledges show as a public counter.
	</p>
</div>

<div class="grid gap-8 lg:grid-cols-2">
	{#each [{ kind: 'endorsement', title: 'Endorsements', blurb: 'Notable supporters shown on your public endorsement wall once approved.', items: data.endorsements }, { kind: 'testimonial', title: 'Testimonials', blurb: 'Citizen stories about your work, shown publicly once approved.', items: data.testimonials }] as section (section.kind)}
		<div>
			<h2 class="text-lg font-semibold text-heading">
				{section.title} <span class="text-sm font-normal text-muted">({section.items.length})</span>
			</h2>
			<p class="mt-1 text-sm text-muted">{section.blurb}</p>

			<!-- Team-entered items collected offline -->
			<form method="post" action="?/add" class="mt-4 space-y-2 rounded-2xl bg-surface-2 p-4" use:enhance>
				<input type="hidden" name="kind" value={section.kind} />
				<div class="grid gap-2 sm:grid-cols-2">
					<input
						type="text"
						name="authorName"
						required
						placeholder="Name"
						class="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
					/>
					<input
						type="text"
						name="authorRole"
						placeholder="Role, e.g. Chair, Boda SACCO"
						class="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
					/>
				</div>
				<textarea
					name="message"
					rows="2"
					required
					placeholder={section.kind === 'endorsement' ? 'Why they endorse you' : 'Their story'}
					class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
				></textarea>
				<button
					type="submit"
					class="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
				>
					Add {section.kind}
				</button>
			</form>

			<ul class="mt-4 space-y-3">
				{#each section.items as item (item.id)}
					<li class="rounded-2xl border border-border bg-surface p-4">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="font-medium text-heading">
									{item.authorName}
									{#if item.authorRole}<span class="text-xs text-muted"> · {item.authorRole}</span>{/if}
									{#if item.ward}<span class="text-xs text-muted"> · {item.ward}</span>{/if}
								</p>
							</div>
							<span
								class="rounded-full px-2.5 py-0.5 text-xs font-semibold {item.approved
									? 'bg-primary-soft text-on-primary'
									: 'border border-border bg-surface-2 text-muted'}"
							>
								{item.approved ? 'Public' : 'Pending'}
							</span>
						</div>
						{#if item.message}
							<p class="mt-2 text-sm leading-relaxed">{item.message}</p>
						{/if}
						<div class="mt-3 flex gap-2">
							<form method="post" action="?/toggleApproval" use:enhance>
								<input type="hidden" name="endorsementId" value={item.id} />
								<button
									type="submit"
									class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
								>
									{item.approved ? 'Hide' : 'Approve'}
								</button>
							</form>
							<form method="post" action="?/remove" use:enhance>
								<input type="hidden" name="endorsementId" value={item.id} />
								<button
									type="submit"
									class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
								>
									Delete
								</button>
							</form>
						</div>
					</li>
				{:else}
					<li class="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
						None yet. Citizens can submit from your campaign page.
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</div>
