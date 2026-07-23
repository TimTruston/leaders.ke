<script lang="ts">
	import { enhance } from '$app/forms';
	import PositionSelector from '$lib/components/PositionSelector.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// The campaign family's (/dashboard/[slug]/campaign) +page.server.ts shapes
	// `data` and hosts ?/save.
	type TabData = {
		positions: { id: number; title: string; region: string }[];
		parties?: { id: number; name: string }[];
		cycles: number[];
		campaign: {
			title: string;
			positionId: number | null;
			cycleYear: number;
			description: string;
			iebcCertificateUrl: string | null;
			partyId: number | null;
			verified: boolean;
		};
	};
	let { data, form }: { data: TabData; form: any } = $props();

	let saving = $state(false);
	let description = $state(data.campaign.description);
	// The IEBC PDF rides the same ?/save submit; show its name once picked.
	let certName = $state<string | null>(null);
	// "other" reveals the free-text partyOther input (see resolveOtherParty server-side).
	let partyId = $state(data.campaign.partyId ? String(data.campaign.partyId) : '');
	let partyOther = $state('');

	const missing = $derived(new Set((form as { missingFields?: string[] } | undefined)?.missingFields ?? []));
	const starClass = (field: string) => (missing.has(field) ? 'text-red-500' : 'text-muted');
</script>

<svelte:head><title>Campaign | leaders.ke</title></svelte:head>

<div>
	<h1 class="text-xl font-bold text-heading">Campaign</h1>
	<p class="mt-1 text-sm text-muted">The seat you're contesting, your platform, and your IEBC clearance.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
	{/if}
	{#if form?.saved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Campaign saved.</div>
	{/if}
	{#if data.campaign.verified}
		<p class="mt-4 rounded-xl border border-border px-4 py-2 text-sm text-muted">
			This run is verified and live — the seat and cycle are locked. You can still edit the title, platform and certificate.
		</p>
	{/if}

	<form
		method="post"
		action="?/save"
		enctype="multipart/form-data"
		class="mt-6 space-y-5"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
	>
		<!-- Title (left) + cycle (right) -->
		<div class="grid gap-5 sm:grid-cols-[1fr_auto]">
			<label class="flex flex-col">
				<span class="text-sm font-medium text-heading">Campaign Title <span class={starClass('title')}>*</span></span>
				<input
					type="text"
					name="title"
					value={data.campaign.title}
					placeholder="e.g. Nairobi Forward"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:outline-none"
				/>
			</label>
			<label class="flex flex-col">
				<span class="text-sm font-medium text-heading">Election Year<span class={starClass('cycleYear')}>*</span></span>
				<select
					name="cycleYear"
					value={data.campaign.cycleYear}
					disabled={data.campaign.verified}
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:outline-none disabled:opacity-60 sm:w-32"
				>
					{#each data.cycles as cycle (cycle)}
						<option value={cycle}>{cycle}</option>
					{/each}
				</select>
			</label>
		</div>

		<!-- Seat contested -->
		<div class:opacity-60={data.campaign.verified}>
			<PositionSelector
				positions={data.positions}
				verified={data.campaign.verified}
				initialPositionId={data.campaign.positionId}
			/>
		</div>
		{#if missing.has('positionId')}
			<p class="-mt-3 text-sm font-medium text-red-500">{form?.error}</p>
		{/if}

		<!-- Party contested under: per-run, not per-person — can differ from the party
		this person last held a term under. -->
		{#if data.parties}
			<label class="block">
				<span class="text-sm font-medium text-heading">Party</span>
				<select
					name="partyId"
					bind:value={partyId}
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:outline-none"
				>
					<option value="">Independent (no party)</option>
					{#each data.parties as party (party.id)}
						<option value={String(party.id)}>{party.name}</option>
					{/each}
					<option value="other">Other (not listed)…</option>
				</select>
				{#if partyId === 'other'}
					<input
						type="text"
						name="partyOther"
						bind:value={partyOther}
						required
						placeholder="Party name"
						class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:outline-none"
					/>
				{/if}
			</label>
		{/if}

		<!-- Platform / description -->
		<div class="block">
			<span class="text-sm font-medium text-heading">Campaign platform <span class={starClass('description')}>*</span></span>
			<div class="mt-1.5">
				<RichTextEditor name="description" bind:value={description} rows={6} placeholder="What you'll deliver, and why voters should back you." />
			</div>
		</div>

		<!-- IEBC certificate (PDF) -->
		<div class="block">
			<span class="text-sm font-medium text-heading">IEBC Certificate of Clearance (PDF)</span>
			<label
				class="mt-1.5 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-sm transition hover:bg-surface-2"
			>
				{#if certName}
					<span class="truncate text-heading">{certName}</span>
				{:else if data.campaign.iebcCertificateUrl}
					<a href={data.campaign.iebcCertificateUrl} target="_blank" rel="noopener" onclick={(e) => e.stopPropagation()} class="truncate text-primary hover:underline">
						View uploaded PDF
					</a>
				{:else}
					<span class="truncate text-muted">No certificate yet</span>
				{/if}
				<span class="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-heading">
					{data.campaign.iebcCertificateUrl || certName ? 'Replace' : 'Upload'}
				</span>
				<input
					type="file"
					name="iebc-certificate"
					accept="application/pdf"
					onchange={(e) => (certName = (e.currentTarget as HTMLInputElement).files?.[0]?.name ?? null)}
					class="sr-only"
				/>
			</label>
			<p class="mt-1 text-xs text-muted">Uploads when you press "Save campaign".</p>
		</div>

		<div class="border-t border-border pt-6">
			<button
				type="submit"
				disabled={saving}
				class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{saving ? 'Saving…' : 'Save campaign'}
			</button>
		</div>
	</form>
</div>
