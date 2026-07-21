<script lang="ts">
	// Follower roster shared by the manager view (/dashboard/[slug]/followers, all
	// followers) and the ambassador view (/dashboard/mobilize/[subjectId], only the
	// citizens they recruited — addedBy scoping happens server-side). "Add a citizen"
	// (blueprint funnel A) sits on top; the contact channels double as digest opt-ins.
	import { enhance } from '$app/forms';
	import DataTable, { type Column } from '$lib/components/DataTable.svelte';

	export type FollowerRow = {
		id: number;
		name: string;
		phone: string | null;
		email: string | null;
		ward: string | null;
		joinedAt: string;
	};

	let {
		followers,
		total,
		page,
		pageSize,
		pagerHref,
		county = null,
		addAction = '?/addFollower'
	}: {
		followers: FollowerRow[];
		total: number;
		page: number;
		pageSize: number;
		pagerHref: (page: number) => string;
		county?: string | null;
		addAction?: string;
	} = $props();

	let saving = $state(false);

	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });
	const columns: Column<FollowerRow>[] = [
		{ key: 'name', label: 'Name', sortable: true },
		{ key: 'phone', label: 'Phone' },
		{ key: 'email', label: 'Email' },
		{ key: 'ward', label: 'Ward', sortable: true },
		{
			key: 'joinedAt',
			label: 'Joined',
			sortable: true,
			format: (v) => dateFmt.format(new Date(String(v)))
		}
	];
</script>

<div class="mb-4">
	<form
		method="post"
		action={addAction}
		class="rounded-2xl border border-border bg-surface-2 p-4"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				await update({ reset: result.type === 'success' });
			};
		}}
	>
		{#if county}<input type="hidden" name="county" value={county} />{/if}
		<div class="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
				<span class="text-xs font-medium text-muted">Phone</span>
				<input
					type="tel"
					name="phone"
					placeholder="0712 345 678"
					class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-xs font-medium text-muted">Email</span>
				<input
					type="email"
					name="email"
					placeholder="citizen@email.com"
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
			<button
				type="submit"
				disabled={saving}
				class="rounded-full bg-surface border border-border px-5 py-2.5 text-sm font-semibold text-primary transition hover:border-primary disabled:opacity-60"
			>
				{saving ? 'Adding…' : 'Add citizen'}
			</button>
		</div>
		<p class="mt-2 text-xs text-muted">
			Each contact you provide receives campaign updates. Make sure they've agreed to be added.
		</p>
	</form>
</div>

<DataTable {columns} rows={followers} itemLabel="followers" {total} {page} {pageSize} {pagerHref} />
