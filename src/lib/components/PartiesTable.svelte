<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';

	type Party = {
		id: number;
		slug: string;
		name: string;
		abbreviation: string | null;
		logo: string | null;
		status: string;
		createdAt: string;
		certifiedAt: string | null;
		verifiedAt: string | null;
		memberCount: number;
	};

	// Shared by /dashboard/admin/parties (with the Verify/Unverify action column)
	// and the public /parties directory (read-only — showActions defaults false).
	let { parties, showActions = false, error }: { parties: Party[]; showActions?: boolean; error?: string } = $props();

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
	const initialsOf = (name: string) =>
		name
			.split(/\s+/)
			.map((w) => w[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();

	let query = $state('');

	type SortCol = 'name' | 'members' | 'status' | 'createdAt' | 'certifiedAt' | 'verifiedAt';
	let sortCol = $state<SortCol>('members');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function sortBy(col: SortCol) {
		if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else {
			sortCol = col;
			sortDir = 'asc';
		}
	}
	const sortArrow = (col: SortCol) => (sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '');

	const verifiedCount = $derived(parties.filter((p) => p.verifiedAt).length);
	const unverifiedCount = $derived(parties.length - verifiedCount);

	const filtered = $derived(
		parties.filter((p) => {
			const q = query.trim().toLowerCase();
			if (!q) return true;
			return p.name.toLowerCase().includes(q) || (p.abbreviation ?? '').toLowerCase().includes(q);
		})
	);

	const sorted = $derived(
		[...filtered].sort((a, b) => {
			const dir = sortDir === 'asc' ? 1 : -1;
			switch (sortCol) {
				case 'members':
					return (a.memberCount - b.memberCount) * dir;
				case 'status':
					return a.status.localeCompare(b.status) * dir;
				case 'createdAt':
					return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
				case 'certifiedAt':
					return ((a.certifiedAt ? new Date(a.certifiedAt).getTime() : 0) - (b.certifiedAt ? new Date(b.certifiedAt).getTime() : 0)) * dir;
				case 'verifiedAt':
					return ((a.verifiedAt ? new Date(a.verifiedAt).getTime() : 0) - (b.verifiedAt ? new Date(b.verifiedAt).getTime() : 0)) * dir;
				default:
					return a.name.localeCompare(b.name) * dir;
			}
		})
	);
</script>

{#if error}
	<div class="mb-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{error}</div>
{/if}

<div class="flex flex-wrap items-center justify-between gap-3">
	<input
		type="search"
		bind:value={query}
		placeholder="Search name or abbreviation…"
		class="w-full max-w-xs rounded-full border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
	/>
	<p class="text-sm text-muted">
		<span class="font-semibold text-heading">Verified ({verifiedCount})</span>
		<span class="mx-1">·</span>
		<span class="font-semibold text-heading">Unverified ({unverifiedCount})</span>
	</p>
</div>

<div class="mt-4 overflow-x-auto rounded-2xl border border-border">
	<table class="w-full text-sm">
		<thead class="bg-surface-2 text-left text-xs font-semibold tracking-wide text-muted uppercase">
			<tr>
				{#snippet sortable(col: SortCol, label: string)}
					<th class="px-4 py-2.5">
						<button type="button" onclick={() => sortBy(col)} class="inline-flex items-center gap-1 uppercase hover:text-primary" class:text-primary={sortCol === col}>
							{label}<span class="text-xs">{sortArrow(col)}</span>
						</button>
					</th>
				{/snippet}
				<th class="px-4 py-2.5">Logo</th>
				{@render sortable('name', 'Party')}
				{@render sortable('members', 'Members')}
				{@render sortable('status', 'ORPP status')}
				{@render sortable('createdAt', 'Added')}
				{@render sortable('certifiedAt', 'Certified')}
				{@render sortable('verifiedAt', 'Verified')}
				{#if showActions}
					<th class="px-4 py-2.5">Actions</th>
				{/if}
			</tr>
		</thead>
		<tbody class="divide-y divide-border">
			{#each sorted as party (party.id)}
				<tr onclick={() => goto(`/parties/${party.slug}`)} class="cursor-pointer transition hover:bg-surface-2">
					<td class="px-4 py-2.5">
						<Avatar name={party.name} initials={initialsOf(party.name)} photoUrl={party.logo} sizeClass="size-9" textClass="text-xs" />
					</td>
					<td class="px-4 py-2.5">
						<p class="font-medium text-heading">{party.name}</p>
						{#if party.abbreviation}<p class="text-xs text-muted">{party.abbreviation}</p>{/if}
					</td>
					<td class="px-4 py-2.5 text-muted">{party.memberCount}</td>
					<td class="px-4 py-2.5 text-muted capitalize">{party.status}</td>
					<td class="px-4 py-2.5 text-muted">{dateFmt.format(new Date(party.createdAt))}</td>
					<td class="px-4 py-2.5 text-muted">{party.certifiedAt ? dateFmt.format(new Date(party.certifiedAt)) : '—'}</td>
					<td class="px-4 py-2.5">
						<span
							title="Confirms the party's ORPP listing was manually checked. A badge only, never a visibility gate."
							class="cursor-help rounded-full px-2.5 py-0.5 text-xs font-semibold {party.verifiedAt
								? 'bg-primary-soft text-on-primary'
								: 'border border-border text-muted'}"
						>
							{party.verifiedAt ? dateFmt.format(new Date(party.verifiedAt)) : 'Unverified'}
						</span>
					</td>
					{#if showActions}
						<td class="px-4 py-2.5 text-right">
							<form method="post" action={party.verifiedAt ? '?/unverify' : '?/verify'} use:enhance>
								<input type="hidden" name="partyId" value={party.id} />
								<button
									type="submit"
									onclick={(e) => e.stopPropagation()}
									class="rounded-full border border-border px-3 py-1 text-xs font-semibold text-heading transition hover:bg-surface-2"
								>
									{party.verifiedAt ? 'Unverify' : 'Verify'}
								</button>
							</form>
						</td>
					{/if}
				</tr>
			{:else}
				<tr>
					<td colspan={showActions ? 8 : 7} class="px-4 py-8 text-center text-sm text-muted">No parties match your search.</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
