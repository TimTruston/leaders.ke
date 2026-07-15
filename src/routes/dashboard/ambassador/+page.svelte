<script lang="ts">
	import { enhance } from '$app/forms';
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
	const rosterFor = (leaderId: number) => data.rosters.find((r) => r.leaderId === leaderId);

	let addingFor = $state<number | null>(null);
	let saving = $state(false);
</script>

<svelte:head><title>Ambassador — leaders.ke</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">My campaigns</h1>
	<p class="mt-1 text-sm text-muted">Campaigns you mobilize citizens for as an ambassador.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}
	{#if form?.left}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
			You've left that campaign.
		</div>
	{:else if form?.added}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
			{form.added.name} now follows this campaign.
		</div>
	{/if}

	{#if data.assignments.length > 0}
		<ul class="mt-6 space-y-3">
			{#each data.assignments as assignment (assignment.id)}
				{@const roster = rosterFor(assignment.leaderId)}
				<li class="rounded-2xl border border-border bg-surface p-5">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="min-w-0">
							<a href={assignment.leaderPath} class="font-semibold text-heading hover:text-primary">
								{assignment.leaderName}
							</a>
							<p class="text-sm text-muted">{assignment.positionTitle}, {assignment.region}</p>
						</div>
						<div class="flex flex-wrap gap-2">
							<button
								type="button"
								onclick={() => (addingFor = addingFor === assignment.leaderId ? null : assignment.leaderId)}
								class="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
							>
								{addingFor === assignment.leaderId ? 'Close' : '+ Add a citizen'}
							</button>
							<form
								method="post"
								action="?/leave"
								use:enhance={({ cancel }) => {
									if (!confirm(`Leave ${assignment.leaderName}'s campaign?`)) cancel();
								}}
							>
								<input type="hidden" name="ambassadorId" value={assignment.id} />
								<button
									type="submit"
									class="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
								>
									Leave
								</button>
							</form>
						</div>
					</div>

					{#if addingFor === assignment.leaderId}
						<!-- Blueprint funnel A: ambassador adds a citizen via the dashboard. Same
						fields as the public follow form; contact doubles as the digest opt-in. -->
						<form
							method="post"
							action="?/addFollower"
							class="mt-4 rounded-xl border border-border bg-surface-2 p-4"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									saving = false;
									if (result.type === 'success') addingFor = null;
									await update({ reset: result.type === 'success' });
								};
							}}
						>
							<input type="hidden" name="leaderId" value={assignment.leaderId} />
							<input type="hidden" name="county" value={assignment.region} />
							<div class="grid gap-3 sm:grid-cols-3">
								<label class="block">
									<span class="text-xs font-medium text-muted">Name <span class="text-red-500">*</span></span>
									<input
										type="text"
										name="name"
										required
										placeholder="Wanjiku Kamau"
										class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
									/>
								</label>
								<label class="block">
									<span class="text-xs font-medium text-muted">Phone or email <span class="text-red-500">*</span></span>
									<input
										type="text"
										name="contact"
										required
										placeholder="0712 345 678"
										class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
									/>
								</label>
								<label class="block">
									<span class="text-xs font-medium text-muted">Ward (optional)</span>
									<input
										type="text"
										name="ward"
										placeholder="Kiharu"
										class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
									/>
								</label>
							</div>
							<p class="mt-2 text-xs text-muted">
								They'll receive campaign updates on the channel you provide. Make sure they've agreed to be added.
							</p>
							<button
								type="submit"
								disabled={saving}
								class="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
							>
								{saving ? 'Adding…' : 'Add citizen'}
							</button>
						</form>
					{/if}

					{#if roster && roster.total > 0}
						<div class="mt-4 border-t border-border pt-3">
							<p class="text-xs font-semibold tracking-wide text-muted uppercase">
								Citizens you added ({roster.total})
							</p>
							<ul class="mt-2 space-y-1.5">
								{#each roster.recruits as recruit (recruit.id)}
									<li class="flex flex-wrap items-center justify-between gap-2 text-sm">
										<span class="text-heading">
											{recruit.name}
											{#if recruit.ward}<span class="text-muted"> · {recruit.ward}</span>{/if}
										</span>
										<span class="text-xs text-muted">{recruit.contact} · {dateFmt.format(new Date(recruit.joinedAt))}</span>
									</li>
								{/each}
							</ul>
							<Pagination
								page={roster.page}
								totalPages={Math.max(1, Math.ceil(roster.total / data.pageSize))}
								total={roster.total}
								itemLabel="citizens"
								href={(p) => `?leader=${assignment.leaderId}&page=${p}`}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
			<p class="font-semibold text-heading">Not mobilizing for anyone yet</p>
			<p class="mx-auto mt-2 max-w-md text-sm text-muted">
				Ask a campaign for an invite link, or find a leader's page and see if they're recruiting
				ambassadors.
			</p>
		</div>
	{/if}
</div>
