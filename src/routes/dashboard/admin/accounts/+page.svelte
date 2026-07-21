<script lang="ts">
	import Pagination from '$lib/components/admin/Pagination.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));
</script>

<svelte:head><title>Accounts — Admin</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Accounts</h1>
	<p class="mt-1 text-sm text-muted">Every signed-up user and the roles they hold.</p>

	{#if data.accounts.length > 0}
		<div class="mt-6 overflow-x-auto rounded-2xl border border-border">
			<table class="w-full min-w-160 border-collapse text-left">
				<thead>
					<tr class="bg-surface-2">
						<th class="px-4 py-3 text-sm font-semibold text-heading">ID</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Name</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Email</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Roles</th>
						<th class="px-4 py-3 text-sm font-semibold text-heading">Joined</th>
					</tr>
				</thead>
				<tbody>
					{#each data.accounts as account (account.userId)}
						<tr class="border-t border-border">
							<td class="px-4 py-3 text-sm text-heading">{account.userId}</td>
							<td class="px-4 py-3 text-sm text-heading">{account.name}</td>
							<td class="px-4 py-3 text-sm text-muted">{account.email}</td>
							<td class="px-4 py-3 text-sm text-muted">
								{[
									account.isAdmin && 'Admin',
									account.isLeader && 'Leader',
									account.isManager && 'Manager',
									account.isAmbassador && 'Ambassador'
								]
									.filter(Boolean)
									.join(', ') || '—'}
							</td>
							<td class="px-4 py-3 text-sm text-muted">{dateFmt.format(new Date(account.createdAt))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<Pagination page={data.page} {totalPages} total={data.total} itemLabel="accounts" href={(p) => `?page=${p}`} />
	{:else}
		<p class="mt-6 text-sm text-muted">No accounts yet.</p>
	{/if}

	<p class="mt-6 text-xs text-muted">
		Platform-admin access isn't managed from this page. To grant or revoke it, run against the
		database directly: <code class="rounded bg-surface-2 px-1.5 py-0.5">update users set admin_at
		= now() where id = &lt;user id&gt;;</code> to grant, or
		<code class="rounded bg-surface-2 px-1.5 py-0.5">update users set admin_at = null where id =
		&lt;user id&gt;;</code> to revoke.
	</p>
</div>
