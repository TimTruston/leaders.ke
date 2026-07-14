<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Team — leaders.ke</title></svelte:head>

{#if data.noProfile}
	<div class="rounded-2xl border border-dashed border-border p-8 text-center">
		<p class="font-semibold text-heading">Save your profile first</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-muted">
			Your team is tied to your campaign profile — fill in the Leader's Profile tab, then come
			back here to invite people.
		</p>
		<a
			href="/dashboard/profile"
			class="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
		>
			Go to Leader's Profile
		</a>
	</div>
{:else}
{#if form?.error}
	<div class="mb-6 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
		{form.error}
	</div>
{/if}
{#if form?.granted}
	<div class="mb-6 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		{form.granted.email} will see the {form.granted.role} role when they visit the dashboard.
	</div>
{:else if form?.invited}
	<div class="mb-6 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		Invite sent to {form.invited.email}
	</div>
{:else if form?.removed}
	<div class="mb-6 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		Successfully removed {form.removed.email}
	</div>
{:else if form?.revoked}
	<div class="mb-6 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
		Invite revoked.
	</div>
{/if}

<div class="grid gap-8 lg:grid-cols-2">
	<!-- Managers -->
	<div>
		<h2 class="text-lg font-semibold text-heading">
			Campaign managers <span class="text-sm font-normal text-muted">({data.managers.length})</span>
		</h2>
		<p class="mt-1 text-sm text-muted">
			Managers run this dashboard with you: profile, manifesto, posts and broadcasts. Only an
			admin manager can invite or remove other managers.
		</p>

		{#if data.isAdmin}
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
					Send invite
				</button>
			</form>
		{/if}


		{#if data.invites.length > 0}
			<ul class="mt-4 space-y-2">
				{#each data.invites as invite (invite.id)}
					<li class="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-sm">
						<span class="truncate text-muted">Invited: {invite.email}</span>
						<form method="post" action="?/revokeInvite" use:enhance>
							<input type="hidden" name="inviteId" value={invite.id} />
							<input type="hidden" name="role" value="manager" />
							{#if data.isAdmin}
							<button type="submit" class="shrink-0 text-xs font-medium text-muted transition hover:text-heading">
								Revoke
							</button>
							{/if}
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		

		<ul class="mt-4 space-y-3">
			{#each data.managers as member (member.id)}
				<li class="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
					<div class="min-w-0">
						<p class="truncate font-medium text-heading">
							{member.name}
							{#if member.admin}
								<span class="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary">
									Admin
								</span>
							{/if}
						</p>
						<p class="truncate text-xs text-muted">{member.email}</p>
					</div>
					{#if member.active}
						{#if data.isAdmin}
							<form method="post" action="?/removeManager" use:enhance>
								<input type="hidden" name="memberId" value={member.id} />
								<button
									type="submit"
									class="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-heading"
								>
									{data.id == member.userId ? 'Leave' : 'Remove'}
								</button>
							</form>
						{/if}
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
				Send invite
			</button>
		</form>

		{#if data.ambassadorInvites.length > 0}
			<ul class="mt-4 space-y-2">
				{#each data.ambassadorInvites as invite (invite.id)}
					<li class="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-sm">
						<span class="truncate text-muted">Invited: {invite.email}</span>
						<form method="post" action="?/revokeInvite" use:enhance>
							<input type="hidden" name="inviteId" value={invite.id} />
							<input type="hidden" name="role" value="ambassador" />
							<button type="submit" class="shrink-0 text-xs font-medium text-muted transition hover:text-heading">
								Revoke
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

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
{/if}
