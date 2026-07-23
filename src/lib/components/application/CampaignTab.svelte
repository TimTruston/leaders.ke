<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import PositionSelector from '$lib/components/PositionSelector.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// The campaign family's (/dashboard/[slug]/campaign) +page.server.ts shapes
	// `data` and hosts ?/save plus the manifesto pillar actions. A person may have
	// zero, one, or (one per election year) two campaigns — each fully independent
	// and individually verified. The pills bar picks which one is open; "Add
	// Campaign" opens a blank form for a not-yet-taken year.
	type Pillar = { id: number; title: string; summary: string; deliveryStatus: string; evidence: string };
	type CampaignSummary = { id: number; label: string; verified: boolean };
	type TabData = {
		isAdmin: boolean;
		profileId: number;
		positions: { id: number; title: string; region: string }[];
		parties?: { id: number; name: string }[];
		cycles: number[];
		newCampaignCycles: number[];
		canAddCampaign: boolean;
		campaigns: CampaignSummary[];
		selectedId: number | null;
		campaign: {
			id: number;
			title: string;
			positionId: number | null;
			cycleYear: number;
			description: string;
			iebcCertificateUrl: string | null;
			partyId: number | null;
			verified: boolean;
		} | null;
		pillars: Pillar[];
		templates: { id: number; title: string; summary: string }[];
	};
	let { data, form }: { data: TabData; form: any } = $props();

	let saving = $state(false);
	// Showing a blank form for a not-yet-saved campaign instead of the selected
	// existing one — client-side only until the first save creates a real row.
	// Starts closed even with zero campaigns: just the empty state + Add button
	// until the user actually asks to add one.
	let creatingNew = $state(false);

	const activeCampaign = $derived(creatingNew ? null : data.campaign);
	let description = $state(activeCampaign?.description ?? '');
	let certName = $state<string | null>(null);
	// "other" reveals the free-text partyOther input (see resolveOtherParty server-side).
	let partyId = $state(activeCampaign?.partyId ? String(activeCampaign.partyId) : '');
	let partyOther = $state('');

	// Resyncs the locally-edited fields whenever a different campaign becomes
	// active — switching tabs (a new `data.campaign`) or entering/leaving "new".
	$effect(() => {
		description = activeCampaign?.description ?? '';
		partyId = activeCampaign?.partyId ? String(activeCampaign.partyId) : '';
		partyOther = '';
		certName = null;
	});

	function startNew() {
		creatingNew = true;
	}

	const missing = $derived(new Set((form as { missingFields?: string[] } | undefined)?.missingFields ?? []));
	const starClass = (field: string) => (missing.has(field) ? 'text-red-500' : 'text-muted');

	// Manifesto pillars: one editable at a time; null means all rows show read-only.
	let editingPillarId = $state<number | null>(null);

	// Picking a template just prefills these — it isn't a link back to the template.
	let newPillarTitle = $state('');
	let newPillarSummary = $state('');
	// Svelte binds <option value={number}> as the actual number (not its string form),
	// so this has to stay a number to match — comparing via String() never found a hit.
	let selectedTemplateId = $state<number | ''>('');

	function onTemplateChange() {
		const template = data.templates.find((t) => t.id === selectedTemplateId);
		newPillarTitle = template?.title ?? '';
		newPillarSummary = template?.summary ?? '';
	}

	// Local, reorderable copy of the list — reordered on drop before the server
	// round-trip finishes, so dragging feels instant. Resyncs whenever the server
	// data changes underneath it (add/edit/delete, or the reorder save itself).
	let orderedPillars = $state(data.pillars);
	$effect(() => {
		orderedPillars = data.pillars;
	});

	let dragIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	function onPillarDragStart(i: number) {
		dragIndex = i;
	}
	function onPillarDragOver(e: DragEvent, i: number) {
		e.preventDefault();
		dragOverIndex = i;
	}
	function onPillarDragEnd() {
		dragIndex = null;
		dragOverIndex = null;
	}
	async function onPillarDrop(i: number) {
		dragOverIndex = null;
		const from = dragIndex;
		dragIndex = null;
		if (from === null || from === i || !data.selectedId) return;

		const next = [...orderedPillars];
		const [moved] = next.splice(from, 1);
		next.splice(i, 0, moved);
		orderedPillars = next;

		const body = new FormData();
		body.set('campaignId', String(data.selectedId));
		body.set('order', next.map((p) => p.id).join(','));
		await fetch('?/reorderPillars', { method: 'POST', body });
		await invalidateAll();
	}

	// Admin-only per-campaign Verify/Unverify — posts to the shared admin control
	// endpoint (same one the dashboard layout's control bar uses), scoped to this
	// one campaign, then reloads this tab.
	let verifying = $state(false);
	async function toggleVerify(campaign: CampaignSummary) {
		const question = campaign.verified ? 'Remove verification from this campaign?' : 'Verify this campaign?';
		if (!confirm(question)) return;
		verifying = true;
		const body = new FormData();
		body.set('profileId', String(data.profileId));
		body.set('campaignId', String(campaign.id));
		body.set('action', campaign.verified ? 'unverifyRunCampaign' : 'verifyRunCampaign');
		body.set('next', window.location.pathname + window.location.search);
		await fetch('/dashboard/admin/profile-action', { method: 'POST', body });
		verifying = false;
		await invalidateAll();
	}
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

	<!-- Campaign pills: one per existing campaign (labeled "{year} #{index}"),
	plus Add Campaign for a not-yet-taken election year. -->
	<div class="mt-4 flex flex-wrap items-center gap-2">
		{#each data.campaigns as c (c.id)}
			<a
				href="?campaign={c.id}"
				onclick={() => (creatingNew = false)}
				class="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition {!creatingNew && data.selectedId === c.id
					? 'border-primary bg-primary-soft text-on-primary'
					: 'border-border text-heading hover:bg-surface-2'}"
			>
				{c.label}
				{#if c.verified}<span title="Verified">✓</span>{/if}
			</a>
		{/each}
		{#if data.canAddCampaign}
			<button
				type="button"
				onclick={startNew}
				class="rounded-full px-3.5 py-1.5 text-xs font-semibold transition {creatingNew
					? 'border border-primary bg-primary-soft text-on-primary'
					: 'border border-dashed border-border text-heading hover:bg-surface-2'}"
			>
				+ Add Campaign
			</button>
		{/if}
	</div>

	{#if !creatingNew && !activeCampaign}
		<div class="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
			No campaigns yet. Add one to declare a seat, platform and manifesto.
		</div>
	{:else}
		{#if activeCampaign?.verified}
			<p class="mt-4 rounded-xl border border-border px-4 py-2 text-sm text-muted">
				This run is verified and live — the seat and cycle are locked. You can still edit the title, platform and certificate.
			</p>
		{/if}
		{#if data.isAdmin && activeCampaign}
			{@const summary = data.campaigns.find((c) => c.id === activeCampaign!.id)}
			{#if summary}
				<button
					type="button"
					disabled={verifying}
					onclick={() => toggleVerify(summary)}
					class="mt-4 rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60 {summary.verified
						? 'bg-primary-soft text-on-primary hover:brightness-95'
						: 'border border-primary text-primary hover:bg-primary hover:text-on-primary'}"
				>
					{summary.verified ? 'Unverify Campaign' : 'Verify Campaign'}
				</button>
			{/if}
		{/if}

		<form
			method="post"
			action="?/save"
			enctype="multipart/form-data"
			class="mt-6 space-y-5"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success' && result.data?.campaignId && creatingNew) {
						creatingNew = false;
						await goto(`?campaign=${result.data.campaignId}`);
						return;
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="campaignId" value={activeCampaign?.id ?? 0} />
			<!-- Title (left) + cycle (right) -->
			<div class="grid gap-5 sm:grid-cols-[1fr_auto]">
				<label class="flex flex-col">
					<span class="text-sm font-medium text-heading">Campaign Title <span class={starClass('title')}>*</span></span>
					<input
						type="text"
						name="title"
						value={activeCampaign?.title ?? ''}
						placeholder="e.g. Nairobi Forward"
						class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:outline-none"
					/>
				</label>
				<label class="flex flex-col">
					<span class="text-sm font-medium text-heading">Election Year<span class={starClass('cycleYear')}>*</span></span>
					<select
						name="cycleYear"
						value={activeCampaign?.cycleYear ?? (creatingNew ? data.newCampaignCycles[0] : undefined)}
						disabled={!!activeCampaign?.verified}
						class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:outline-none disabled:opacity-60 sm:w-32"
					>
						{#each creatingNew ? data.newCampaignCycles : data.cycles as cycle (cycle)}
							<option value={cycle}>{cycle}</option>
						{/each}
					</select>
				</label>
			</div>

			<!-- Seat contested -->
			<div class:opacity-60={activeCampaign?.verified}>
				<PositionSelector
					positions={data.positions}
					verified={!!activeCampaign?.verified}
					initialPositionId={activeCampaign?.positionId ?? null}
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
					{:else if activeCampaign?.iebcCertificateUrl}
						<a href={activeCampaign.iebcCertificateUrl} target="_blank" rel="noopener" onclick={(e) => e.stopPropagation()} class="truncate text-primary hover:underline">
							View uploaded PDF
						</a>
					{:else}
						<span class="truncate text-muted">No certificate yet</span>
					{/if}
					<span class="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-heading">
						{activeCampaign?.iebcCertificateUrl || certName ? 'Replace' : 'Upload'}
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

		{#if activeCampaign}
			<!-- Manifesto: the itemized, publicly trackable promises for THIS campaign.
			Each pillar is its own immediate-submit form (add/edit/delete/reorder),
			separate from the campaign details form above. -->
			<div class="mt-10 border-t border-border pt-8">
				<h2 class="text-lg font-semibold text-heading">Manifesto</h2>
				<p class="mt-1 text-sm text-muted">
					The promises that citizens see on your public page, in the order you add them. {#if orderedPillars.length > 1} Drag to reorder. {/if}
				</p>

				<ol class="mt-6 space-y-4">
					{#each orderedPillars as pillar, i (pillar.id)}
						<li
							draggable={editingPillarId === null}
							ondragstart={() => onPillarDragStart(i)}
							ondragover={(e) => onPillarDragOver(e, i)}
							ondrop={() => onPillarDrop(i)}
							ondragend={onPillarDragEnd}
							class="flex items-start gap-2 rounded-2xl border bg-surface p-5 transition {dragOverIndex === i && dragIndex !== null && dragIndex !== i
								? 'border-primary'
								: 'border-border'}"
						>
							<div class="min-w-0 flex-1">
							{#if editingPillarId === pillar.id}
								<form
									method="post"
									action="?/updatePillar"
									class="space-y-3"
									use:enhance={() => {
										return async ({ update }) => {
											editingPillarId = null;
											await update();
										};
									}}
								>
									<input type="hidden" name="campaignId" value={activeCampaign.id} />
									<input type="hidden" name="pillarId" value={pillar.id} />
									<input
										type="text"
										name="title"
										required
										value={pillar.title}
										class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
									/>
									<textarea
										name="summary"
										rows="3"
										required
										class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
										>{pillar.summary}</textarea
									>
									<!-- Public delivery tracker: status + verifiable evidence -->
									<div class="grid gap-3 sm:grid-cols-[auto_1fr]">
										<label class="block">
											<span class="text-xs font-medium text-muted">Delivery status (public)</span>
											<select
												name="deliveryStatus"
												value={pillar.deliveryStatus}
												class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
											>
												<option value="promised">Promised</option>
												<option value="in_progress">In progress</option>
												<option value="delivered">Delivered</option>
											</select>
										</label>
										<label class="block">
											<span class="text-xs font-medium text-muted">Evidence (public, optional)</span>
											<input
												type="text"
												name="evidence"
												value={pillar.evidence}
												placeholder="e.g. 7 of 10 dispensaries built"
												class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
											/>
										</label>
									</div>
									<div class="flex gap-2">
										<button
											type="submit"
											class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
										>
											Save
										</button>
										<button
											type="button"
											onclick={() => (editingPillarId = null)}
											class="rounded-full border border-border px-4 py-2 text-sm font-semibold text-heading transition hover:bg-surface-2"
										>
											Cancel
										</button>
									</div>
								</form>
							{:else}
								<div class="flex items-start gap-3">
									<div class="flex flex-col items-center">
										<span
											class="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary"
										>{i + 1}</span>
										{#if editingPillarId === null}
											<span
												class="shrink-0 cursor-grab select-none text-muted"
												aria-hidden="true"
												title="Drag to reorder"
											>⠿</span>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<h3 class="flex flex-wrap items-center gap-2 font-semibold text-heading">
											{pillar.title}
											<span
												class="rounded-full px-2 py-0.5 text-xs font-semibold {pillar.deliveryStatus ===
												'delivered'
													? 'bg-primary text-on-primary'
													: pillar.deliveryStatus === 'in_progress'
														? 'bg-primary-soft text-on-primary'
														: 'border border-border bg-surface-2 text-muted'}"
											>
												{pillar.deliveryStatus === 'in_progress'
													? 'In progress'
													: pillar.deliveryStatus === 'delivered'
														? 'Delivered'
														: 'Promised'}
											</span>
										</h3>
										<p class="mt-1 text-sm leading-relaxed">{pillar.summary}</p>
										{#if pillar.evidence}
											<p class="mt-1 text-xs text-muted">Evidence: {pillar.evidence}</p>
										{/if}
									</div>
									<div class="flex flex-col shrink-0">
										<button
											type="button"
											onclick={() => (editingPillarId = pillar.id)}
											class="rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-heading"
										>
											Edit
										</button>
										<form method="post" action="?/removePillar" use:enhance>
											<input type="hidden" name="campaignId" value={activeCampaign.id} />
											<input type="hidden" name="pillarId" value={pillar.id} />
											<button
												type="submit"
												class="rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-heading"
											>
												Delete
											</button>
										</form>
									</div>
								</div>
							{/if}
							</div>
						</li>
					{:else}
						<li class="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
							Add the first promise citizens should hold you to.
						</li>
					{/each}
				</ol>

				<!-- Add pillar -->
				<form
					method="post"
					action="?/addPillar"
					class="mt-8 rounded-2xl border border-border bg-surface-2 p-5"
					use:enhance={() => {
						return async ({ update }) => {
							newPillarTitle = '';
							newPillarSummary = '';
							selectedTemplateId = '';
							await update();
						};
					}}
				>
					<input type="hidden" name="campaignId" value={activeCampaign.id} />
					<h3 class="font-semibold text-heading">Add Pillars</h3>
					<div class="mt-3 space-y-3">
						{#if data.templates.length > 0}
							<label class="flex gap-4 items-center">
								<p class="text-sm font-medium text-muted">Templates</p>
								<select
									bind:value={selectedTemplateId}
									onchange={onTemplateChange}
									class="mt-1 w-full rounded-xl border border-border bg-surface px-4 py-2 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
								>
									<option value="">Write your own</option>
									{#each data.templates as template (template.id)}
										<option value={template.id}>{template.title}</option>
									{/each}
								</select>
							</label>
						{/if}
						<input
							type="text"
							name="title"
							required
							bind:value={newPillarTitle}
							placeholder="Pillar title, e.g. Water for all"
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
						/>
						<textarea
							name="summary"
							rows="3"
							required
							bind:value={newPillarSummary}
							placeholder="What you will do, stated so a citizen can verify it later."
							class="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
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
		{/if}
	{/if}
</div>
