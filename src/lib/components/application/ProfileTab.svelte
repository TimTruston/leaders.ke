<script lang="ts">
	import { enhance } from '$app/forms';
	import ExperienceBlock from '$lib/components/ExperienceBlock.svelte';
	import PositionSelector from '$lib/components/PositionSelector.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// Shared across the campaign (/dashboard/[slug]), apply (/dashboard/apply/[id]) and
	// claim (/dashboard/claim/[slug]) route families - each family's +page.server.ts
	// shapes `data` to this contract and hosts the actions this form posts to
	// (relative ?/action URLs).
	type TabData = {
		positions: { id: number; title: string; region: string }[];
		// Absent on the claim family (party changes belong to the verified profile's
		// own admins) — the Party select only renders when provided.
		parties?: { id: number; name: string }[];
		existingExperience: { id: number; type: string; title: string; institution: string; from: number | null; to: number | null }[];
		existingLeadership: { id: number; positionTitle: string; region: string; description: string | null; from: number; to: number | null }[];
		form: { firstName: string; otherNames: string; bio: string; positionId: number | null; partyId?: number | null; slug: string | null; hasLeader: boolean; verified: boolean };
		application?: { profile: { missing: string[] } } | null;
	};
	let { data, form }: { data: TabData; form: any } = $props();

	let saving = $state(false);
	// Local editing state for the rich-text bio (the form posts it via name="bio").
	let bio = $state(data.form.bio);
	const missing = $derived(new Set((form as { missingFields?: string[] } | undefined)?.missingFields ?? []));
	// Errored fields aren't outlined - the red * next to the label (starClass) and
	// the message under the save button do the flagging.
	const errorClass = () => 'border-border focus:border-primary focus:ring-ring';

	// Application checklist (from the layout load): a required-field label still in this
	// set is unfilled → its `*` stays red; once saved and out of the set, `*` goes muted.
	// A failed save's missingFields (field names, not labels) redden the same `*`.
	const appMissing = $derived(new Set(data.application?.profile.missing ?? []));
	const FIELD_BY_LABEL: Record<string, string> = {
		'First name': 'firstName',
		'Other names': 'otherNames',
		Bio: 'bio',
		'Elective position': 'positionId'
	};
	const starRed = (label: string) => appMissing.has(label) || missing.has(FIELD_BY_LABEL[label] ?? '');
	const starClass = (label: string) => (starRed(label) ? 'text-red-500' : 'text-muted');

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

	// Year dropdown options, newest first. The "To" pickers filter to years >= the
	// picked "From", so an inverted range can't be selected in the first place
	// (the *Invalid deriveds above stay as backstops for stale picks).
	const years = Array.from({ length: 2030 - 1950 + 1 }, (_, i) => String(2030 - i));
	const expToYears = $derived(expFrom ? years.filter((y) => y >= expFrom) : years);
	const leadToYears = $derived(leadFrom ? years.filter((y) => y >= leadFrom) : years);

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

	<p class="text-sm text-muted">This is what citizens see on the leader's public profile/page.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}
	<!-- Verification submission ("Submit Application") now lives in the layout,
	top-right — it's gated on Profile/Contacts/Team/Documentation together, not just
	this page, so it can't live inside a single tab. -->

	<form
		method="post"
		action="?/save"
		class="mt-4 space-y-5"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				if (result.type === 'success') {
					pendingExperience = [];
					pendingLeadership = [];
					removedExperienceIds = [];
					removedLeadershipIds = [];
				}
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
				<span class="text-sm font-medium text-heading">First name <span class={starClass('First name')}>*</span></span>
				<input
					type="text"
					name="firstName"
					required
					value={data.form.firstName}
					class="mt-1.5 w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-heading focus:ring-0 focus:outline-none {errorClass()}"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-heading">Other names <span class={starClass('Other names')}>*</span></span>
				<input
					type="text"
					name="otherNames"
					required
					value={data.form.otherNames}
					class="mt-1.5 w-full rounded-xl border bg-surface px-4 py-2.5 text-sm text-heading focus:ring-0 focus:outline-none {errorClass()}"
				/>
			</label>
		</div>
		{#if missing.has('firstName') || missing.has('otherNames')}
			<p class="-mt-3 text-sm font-medium text-red-500">{form?.error}</p>
		{/if}

		{#if data.form.verified}
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
		{/if}

		<div class="rounded-xl ">
			<PositionSelector
				positions={data.positions}
				verified={data.form.verified}
				initialPositionId={data.form.positionId}
			/>
		</div>
		{#if missing.has('positionId')}
			<p class="-mt-3 text-sm font-medium text-red-500">{form?.error}</p>
		{/if}

		{#if data.parties}
			<label class="block">
				<span class="text-sm font-medium text-heading">Party</span>
				<select
					name="partyId"
					value={data.form.partyId ?? ''}
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				>
					<option value="">Independent (no party)</option>
					{#each data.parties as party (party.id)}
						<option value={party.id}>{party.name}</option>
					{/each}
				</select>
			</label>
		{/if}

		<div class="block">
			<span class="text-sm font-medium text-heading">Bio <span class={starClass('Bio')}>*</span></span>
			<div class="mt-1.5">
				<RichTextEditor
					name="bio"
					bind:value={bio}
					rows={5}
					placeholder="Who you are, what you have done, and why you are running."
				/>
			</div>
		</div>
		{#if missing.has('bio')}
			<p class="-mt-3 text-sm font-medium text-red-500">{form?.error}</p>
		{/if}

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
						+ Elected
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
								<span class="text-sm font-medium text-heading">Description</span>
								<input
									type="text"
									bind:value={leadDescription}
									maxlength="255"
									placeholder="Optional"
									class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
								/>
							</label>
							<div class="grid grid-cols-2 gap-3">
								<label class="block">
									<span class="text-sm font-medium text-heading">From</span>
									<select
										bind:value={leadFrom}
										class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
									>
										<option value="">Year</option>
										{#each years as year (year)}
											<option value={year}>{year}</option>
										{/each}
									</select>
								</label>
								<label class="block">
									<span class="text-sm font-medium text-heading">To (optional)</span>
									<select
										bind:value={leadTo}
										class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
									>
										<option value="">Ongoing</option>
										{#each leadToYears as year (year)}
											<option value={year}>{year}</option>
										{/each}
									</select>
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
								Add elected role
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
								class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
							/>
						</label>
						<label class="block">
							<span class="text-sm font-medium text-heading">Institution</span>
							<input
								type="text"
								bind:value={expInstitution}
								placeholder={adding === 'education' ? 'University of Nairobi' : 'Government of Kenya'}
								class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
							/>
						</label>
						<div class="grid grid-cols-2 gap-3">
							<label class="block">
								<span class="text-sm font-medium text-heading">From</span>
								<select
									bind:value={expFrom}
									class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
								>
									<option value="">Year</option>
									{#each years as year (year)}
										<option value={year}>{year}</option>
									{/each}
								</select>
							</label>
							<label class="block">
								<span class="text-sm font-medium text-heading">To (optional)</span>
								<select
									bind:value={expTo}
									class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
								>
									<option value="">Ongoing</option>
									{#each expToYears as year (year)}
										<option value={year}>{year}</option>
									{/each}
								</select>
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
			</div>
		{/if}

		<div class="border-t border-border pt-6">
			<button
				type="submit"
				disabled={saving}
				class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{saving ? 'Saving…' : 'Save changes'}
			</button>
		</div>
	</form>
</div>
