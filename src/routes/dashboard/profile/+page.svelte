<script lang="ts">
	import { enhance } from '$app/forms';
	import ExperienceBlock from '$lib/components/ExperienceBlock.svelte';
	import PositionSelector from '$lib/components/PositionSelector.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let saving = $state(false);

	let adding = $state<'leadership' | 'professional' | 'education' | null>(null);
	function toggleAdding(type: 'leadership' | 'professional' | 'education') {
		adding = adding === type ? null : type;
	}

	type PendingExperience = {
		type: 'education' | 'professional';
		title: string;
		institution: string;
		from: string; // ISO date (YYYY-MM-DD)
		to: string | null;
	};
	type PendingLeadership = {
		positionId: number;
		positionLabel: string;
		description: string;
		from: string; // ISO date (YYYY-MM-DD)
		to: string | null;
	};

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	let pendingExperience = $state<PendingExperience[]>([]);
	let pendingLeadership = $state<PendingLeadership[]>([]);

	// Already-saved rows staged for removal (by id) — actually deleted server-side
	// only when "Save profile" is clicked, same deferred-save model as additions.
	let removedExperienceIds = $state<number[]>([]);
	let removedLeadershipIds = $state<number[]>([]);
	const visibleExperience = $derived(
		data.existingExperience.filter((e) => !removedExperienceIds.includes(e.id))
	);
	const visibleLeadership = $derived(
		data.existingLeadership.filter((l) => !removedLeadershipIds.includes(l.id))
	);

	// Inline "add" form fields — cleared after each staged entry.
	let expTitle = $state('');
	let expInstitution = $state('');
	let expFrom = $state('');
	let expTo = $state('');

	let leadPositionId = $state<number | ''>('');
	let leadDescription = $state('');
	let leadFrom = $state('');
	let leadTo = $state('');
	let leadResetKey = $state(0);

	// "To" before "From" is invalid — same rule enforced again server-side.
	const expDateInvalid = $derived(!!expFrom && !!expTo && expTo < expFrom);
	const leadDateInvalid = $derived(!!leadFrom && !!leadTo && leadTo < leadFrom);

	function addExperience() {
		if (adding !== 'professional' && adding !== 'education') return;
		if (!expTitle.trim() || !expInstitution.trim() || !expFrom || expDateInvalid) return;
		pendingExperience.push({
			type: adding,
			title: expTitle.trim(),
			institution: expInstitution.trim(),
			from: expFrom,
			to: expTo || null
		});
		expTitle = expInstitution = expFrom = expTo = '';
		adding = null;
	}

	function addLeadership() {
		if (!leadPositionId || !leadFrom || leadDateInvalid) return;
		const position = data.positions.find((p) => p.id === leadPositionId);
		if (!position) return;
		pendingLeadership.push({
			positionId: leadPositionId,
			positionLabel: `${position.title}, ${position.region}`,
			description: leadDescription.trim(),
			from: leadFrom,
			to: leadTo || null
		});
		leadPositionId = '';
		leadDescription = leadFrom = leadTo = '';
		leadResetKey++;
		adding = null;
	}

	function removeExperience(i: number) {
		pendingExperience.splice(i, 1);
	}
	function removeLeadership(i: number) {
		pendingLeadership.splice(i, 1);
	}
	function removeExistingExperience(id: number) {
		removedExperienceIds.push(id);
	}
	function removeExistingLeadership(id: number) {
		removedLeadershipIds.push(id);
	}
</script>

<svelte:head><title>Profile — leaders.ke</title></svelte:head>

<div class="">
	<h2 class="text-lg font-semibold text-heading">
		{data.form.hasLeader ? 'Leader profile' : 'Create your leader profile'}
	</h2>
	<p class="mt-1 text-sm text-muted">
		{data.form.hasLeader
			? 'This is what citizens see on your public page.'
			: 'Pick your seat and introduce yourself; this unlocks the rest of the campaign HQ.'}
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}
	{#if form?.saved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">
			Profile saved.
		</div>
	{/if}

	<form
		method="post"
		action="?/save"
		class="mt-6 space-y-5"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				pendingExperience = [];
				pendingLeadership = [];
				removedExperienceIds = [];
				removedLeadershipIds = [];
				// Default enhance behavior calls form.reset() on success, wiping every
				// field back to blank — this form re-renders from `data`, so skip that.
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="experienceEntries" value={JSON.stringify(pendingExperience)} />
		<input type="hidden" name="leadershipEntries" value={JSON.stringify(pendingLeadership)} />
		<input type="hidden" name="removedExperienceIds" value={JSON.stringify(removedExperienceIds)} />
		<input type="hidden" name="removedLeadershipIds" value={JSON.stringify(removedLeadershipIds)} />

		<div class="grid gap-5 sm:grid-cols-2">
			<label class="block">
				<span class="text-sm font-medium text-heading">First name</span>
				<input
					type="text"
					name="firstName"
					required
					value={data.form.firstName}
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-heading">Other names</span>
				<input
					type="text"
					name="otherNames"
					required
					value={data.form.otherNames}
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
				/>
			</label>
		</div>

		<label class="block">
			<span class="text-sm font-medium text-heading">Your public URL</span>
			<div class="mt-1.5 flex items-center rounded-xl border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
				<span class="pl-4 text-sm text-muted">leaders.ke/</span>
				<input
					type="text"
					name="slug"
					placeholder={data.form.slug ?? 'your-name'}
					value={data.form.slug ?? ''}
					class="w-full border-0 bg-transparent py-2.5 pr-4 pl-1 text-sm text-heading placeholder:text-muted focus:outline-none"
				/>
			</div>
			<p class="mt-1 text-xs text-muted">
				This is your permanent profile link. Leave unchanged unless you want a different one.
			</p>
		</label>

		<PositionSelector
			positions={data.positions}
			verified={data.form.verified}
			initialPositionId={data.form.positionId}
		/>

		<label class="block">
			<span class="text-sm font-medium text-heading">Bio</span>
			<textarea
				name="bio"
				rows="5"
				placeholder="Who you are, what you have done, and why you are running."
				class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
				>{data.form.bio}</textarea
			>
		</label>

		{#if data.form.hasLeader}
			<div class="border-t border-border pt-6">
				<h3 class="text-lg font-semibold text-heading">Experience</h3>

				{#if visibleLeadership.length > 0 || pendingLeadership.length > 0}
					<h4 class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Leadership</h4>
					<ul class="mt-2 space-y-2">
						{#each visibleLeadership as item (item.id)}
							<ExperienceBlock
								title="{item.positionTitle}, {item.region}"
								description={item.description}
								dateLabel="{item.from}–{item.to ?? 'present'}"
								onRemove={() => removeExistingLeadership(item.id)}
							/>
						{/each}
						{#each pendingLeadership as item, i (i)}
							<ExperienceBlock
								title={item.positionLabel}
								description={item.description}
								dateLabel="{formatDate(item.from)}–{item.to ? formatDate(item.to) : 'present'}"
								unsaved
								pending
								onRemove={() => removeLeadership(i)}
							/>
						{/each}
					</ul>
				{/if}

				{#if visibleExperience.some((e) => e.type === 'professional') || pendingExperience.some((e) => e.type === 'professional')}
					<h4 class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Professional</h4>
					<ul class="mt-2 space-y-2">
						{#each visibleExperience.filter((e) => e.type === 'professional') as item (item.id)}
							<ExperienceBlock
								title={item.title}
								subtitle={item.institution}
								dateLabel="{item.from}{item.to ? `–${item.to}` : ''}"
								onRemove={() => removeExistingExperience(item.id)}
							/>
						{/each}
						{#each pendingExperience as item, i (i)}
							{#if item.type === 'professional'}
								<ExperienceBlock
									title={item.title}
									subtitle={item.institution}
									dateLabel="{formatDate(item.from)}{item.to ? `–${formatDate(item.to)}` : ''}"
									unsaved
									pending
									onRemove={() => removeExperience(i)}
								/>
							{/if}
						{/each}
					</ul>
				{/if}

				{#if visibleExperience.some((e) => e.type === 'education') || pendingExperience.some((e) => e.type === 'education')}
					<h4 class="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">Education</h4>
					<ul class="mt-2 space-y-2">
						{#each visibleExperience.filter((e) => e.type === 'education') as item (item.id)}
							<ExperienceBlock
								title={item.title}
								subtitle={item.institution}
								dateLabel="{item.from}{item.to ? `–${item.to}` : ''}"
								onRemove={() => removeExistingExperience(item.id)}
							/>
						{/each}
						{#each pendingExperience as item, i (i)}
							{#if item.type === 'education'}
								<ExperienceBlock
									title={item.title}
									subtitle={item.institution}
									dateLabel="{formatDate(item.from)}{item.to ? `–${formatDate(item.to)}` : ''}"
									unsaved
									pending
									onRemove={() => removeExperience(i)}
								/>
							{/if}
						{/each}
					</ul>
				{/if}

				<div class="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						onclick={() => toggleAdding('leadership')}
						class="rounded-full border px-4 py-2 text-sm font-semibold transition {adding === 'leadership'
							? 'border-primary bg-primary text-on-primary'
							: 'border-border bg-surface text-heading hover:bg-surface-2'}"
					>
						+ Leadership
					</button>
					<button
						type="button"
						onclick={() => toggleAdding('professional')}
						class="rounded-full border px-4 py-2 text-sm font-semibold transition {adding === 'professional'
							? 'border-primary bg-primary text-on-primary'
							: 'border-border bg-surface text-heading hover:bg-surface-2'}"
					>
						+ Professional
					</button>
					<button
						type="button"
						onclick={() => toggleAdding('education')}
						class="rounded-full border px-4 py-2 text-sm font-semibold transition {adding === 'education'
							? 'border-primary bg-primary text-on-primary'
							: 'border-border bg-surface text-heading hover:bg-surface-2'}"
					>
						+ Education
					</button>
				</div>

				{#if adding === 'leadership'}
					{#key leadResetKey}
						<div class="mt-4 space-y-4 rounded-xl border border-border bg-surface-2 p-4">
							<PositionSelector
								positions={data.positions}
								verified={false}
								initialPositionId={null}
								label="Position held"
								required={false}
								bind:value={leadPositionId}
							/>
							<label class="block">
								<span class="text-sm font-medium text-heading">Note</span>
								<input
									type="text"
									bind:value={leadDescription}
									maxlength="255"
									placeholder="Optional short description"
									class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
								/>
							</label>
							<div class="grid grid-cols-2 gap-3">
								<label class="block">
									<span class="text-sm font-medium text-heading">From</span>
									<input
										type="date"
										bind:value={leadFrom}
										class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
									/>
								</label>
								<label class="block">
									<span class="text-sm font-medium text-heading">To (optional)</span>
									<input
										type="date"
										bind:value={leadTo}
										min={leadFrom || undefined}
										class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
									/>
								</label>
							</div>
							{#if leadDateInvalid}
								<p class="text-sm font-medium text-heading">"To" can't be before "From".</p>
							{/if}
							<button
								type="button"
								onclick={addLeadership}
								disabled={!leadPositionId || !leadFrom || leadDateInvalid}
								class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
							>
								Add leadership role
							</button>
						</div>
					{/key}
				{:else if adding === 'professional' || adding === 'education'}
					<div class="mt-4 space-y-4 rounded-xl border border-border bg-surface-2 p-4">
						<label class="block">
							<span class="text-sm font-medium text-heading">Title</span>
							<input
								type="text"
								bind:value={expTitle}
								placeholder={adding === 'education' ? 'Bachelor of Laws (LL.B.)' : 'Minister for Agriculture'}
								class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
							/>
						</label>
						<label class="block">
							<span class="text-sm font-medium text-heading">Institution</span>
							<input
								type="text"
								bind:value={expInstitution}
								placeholder={adding === 'education' ? 'University of Nairobi' : 'Government of Kenya'}
								class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
							/>
						</label>
						<div class="grid grid-cols-2 gap-3">
							<label class="block">
								<span class="text-sm font-medium text-heading">From</span>
								<input
									type="date"
									bind:value={expFrom}
									class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
								/>
							</label>
							<label class="block">
								<span class="text-sm font-medium text-heading">To (optional)</span>
								<input
									type="date"
									bind:value={expTo}
									min={expFrom || undefined}
									class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-2 focus:ring-ring focus:outline-none"
								/>
							</label>
						</div>
						{#if expDateInvalid}
							<p class="text-sm font-medium text-heading">"To" can't be before "From".</p>
						{/if}
						<button
							type="button"
							onclick={addExperience}
							disabled={!expTitle.trim() || !expInstitution.trim() || !expFrom || expDateInvalid}
							class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
						>
							Add {adding}
						</button>
					</div>
				{/if}

				<p class="mt-3 text-xs text-muted">
					Added entries above are saved when you click "Save profile" below.
				</p>
			</div>
		{/if}

		<button
			type="submit"
			disabled={saving}
			class="rounded-full bg-primary px-6 py-2.5 font-semibold text-on-primary transition hover:brightness-95 focus:ring-2 focus:ring-ring focus:outline-none disabled:opacity-60"
		>
			{saving ? 'Saving…' : data.form.hasLeader ? 'Save profile' : 'Create profile'}
		</button>
	</form>
</div>
