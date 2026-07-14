<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });

	const roleLabel = (role: string) => (role === 'manager' ? 'Manager' : role === 'ambassador' ? 'Ambassador' : 'Follower');
</script>

<svelte:head><title>Invites — leaders.ke</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Invites</h1>
	<p class="mt-1 text-sm text-muted">Campaigns that have invited you to follow, manage, or mobilize for them.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}
	{#if form?.accepted}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
			You're now {form.role === 'manager' ? 'a manager' : form.role === 'ambassador' ? 'an ambassador' : 'a follower'}.
		</div>
	{/if}

	{#if data.invites.length > 0}
		<ul class="mt-6 space-y-3">
			{#each data.invites as invite (invite.token)}
				<li class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
					<div class="min-w-0">
						<p class="font-semibold text-heading">
							<a href={invite.leaderPath} class="hover:text-primary">{invite.leaderName}</a>
							<span class="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
								{roleLabel(invite.role)}
							</span>
						</p>
						<p class="text-sm text-muted">{invite.positionTitle}, {invite.region}</p>
						<p class="mt-1 text-xs text-muted">Invited {dateFmt.format(new Date(invite.createdAt))}</p>
					</div>
					<form method="post" action="?/accept" use:enhance>
						<input type="hidden" name="token" value={invite.token} />
						<button
							type="submit"
							class="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
						>
							Accept
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center">
			<p class="font-semibold text-heading">No invites right now</p>
			<p class="mx-auto mt-2 max-w-md text-sm text-muted">
				Campaigns invite you by email to follow, become an ambassador, or manage their profile —
				anything sent to your account's email shows up here.
			</p>
		</div>
	{/if}
</div>
