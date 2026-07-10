<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Team — leaders.ke</title></svelte:head>

{#if form?.error}
	<div class="mb-6  rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
		{form.error}
	</div>
{/if}
{#if form?.saved}
	<div class="mb-6  rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		Team updated.
	</div>
{/if}

<div class="grid gap-8 lg:grid-cols-2">
	<!-- Managers -->
	<div>
		<h2 class="text-lg font-semibold text-heading">
			Campaign managers <span class="text-sm font-normal text-muted">({data.managers.length})</span>
		</h2>
		<p class="mt-1 text-sm text-muted">
			Managers run this dashboard with you: profile, manifesto, posts and broadcasts.
		</p>

		<form method="post" action="?/inviteManager" class="mt-4 flex flex-wrap gap-2" use:enhance>
			<input
				type="email"
				name="email"
				required
				placeholder="manager@email.com"
				class="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<button
				type="submit"
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Invite
			</button>
		</form>
		<p class="mt-2 text-xs text-muted">Invitees need a leaders.ke account with this email.</p>

		<ul class="mt-4 space-y-3">
			{#each data.managers as member (member.id)}
				<li class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
					<div class="min-w-0">
						<p class="truncate font-medium text-heading">{member.name}</p>
						<p class="truncate text-xs text-muted">{member.email}</p>
					</div>
					{#if member.active}
						<form method="post" action="?/removeManager" use:enhance>
							<input type="hidden" name="memberId" value={member.id} />
							<button
								type="submit"
								class="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
							>
								Remove
							</button>
						</form>
					{:else}
						<span class="shrink-0 text-xs text-muted">Inactive</span>
					{/if}
				</li>
			{:else}
				<li class="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
					No managers yet.
				</li>
			{/each}
		</ul>
	</div>

	<!-- Ambassadors -->
	<div>
		<h2 class="text-lg font-semibold text-heading">
			Ambassadors <span class="text-sm font-normal text-muted">({data.ambassadors.length})</span>
		</h2>
		<p class="mt-1 text-sm text-muted">
			Ambassadors mobilize citizens on the ground and grow your follower base.
		</p>

		<form method="post" action="?/inviteAmbassador" class="mt-4 flex flex-wrap gap-2" use:enhance>
			<input
				type="email"
				name="email"
				required
				placeholder="ambassador@email.com"
				class="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
			/>
			<button
				type="submit"
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Invite
			</button>
		</form>
		<p class="mt-2 text-xs text-muted">Invitees need a leaders.ke account with this email.</p>

		<ul class="mt-4 space-y-3">
			{#each data.ambassadors as member (member.id)}
				<li class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
					<div class="min-w-0">
						<p class="truncate font-medium text-heading">{member.name}</p>
						<p class="truncate text-xs text-muted">{member.email}</p>
					</div>
					{#if member.active}
						<form method="post" action="?/removeAmbassador" use:enhance>
							<input type="hidden" name="memberId" value={member.id} />
							<button
								type="submit"
								class="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
							>
								Remove
							</button>
						</form>
					{:else}
						<span class="shrink-0 text-xs text-muted">Inactive</span>
					{/if}
				</li>
			{:else}
				<li class="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
					No ambassadors yet.
				</li>
			{/each}
		</ul>
	</div>
</div>
