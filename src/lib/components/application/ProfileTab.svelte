<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ExperienceBlock from '$lib/components/ExperienceBlock.svelte';
	import ImageCropper from '$lib/components/ImageCropper.svelte';
	import PositionSelector from '$lib/components/PositionSelector.svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';

	// The campaign family's (/dashboard/[slug]/profile) +page.server.ts shapes
	// `data` to this contract and hosts the actions this form posts to (relative
	// ?/action URLs). The photo is staged locally (cropped, previewed) and
	// uploads WITH ?/save — nothing touches the server before "Save profile".
	type TabData = {
		positions: { id: number; title: string; region: string }[];
		// Absent when the Party select shouldn't render (party changes belong to
		// the verified profile's own admins).
		parties?: { id: number; name: string }[];
		photoUrl?: string | null;
		existingExperience: { id: number; type: string; title: string; institution: string; description?: string | null; from: number | null; to: number | null }[];
		existingLeadership: { id: number; positionTitle: string; region: string; description: string | null; from: number; to: number | null }[];
		form: { firstName: string; otherNames: string; bio: string; positionId: number | null; partyId?: number | null; slug: string | null; hasLeader: boolean; verified: boolean };
		application?: { profile: { complete: boolean; missing: string[] }; documentation?: { missing: string[] } } | null;
	};
	let {
		data,
		form,
		claimAttestation = false
	}: { data: TabData; form: any; claimAttestation?: boolean } = $props();

	// Claim family: auto-advance to Contacts only on the FIRST save (the one that
	// unlocks it). Captured at load so re-editing an already-complete claim (e.g.
	// after a rejection) stays put on Profile instead of being bounced away.
	const advanceOnSave = claimAttestation && !data.application?.profile.complete;

	let saving = $state(false);
	// Claim family only: a false-claim attestation gates the Save button — checked
	// server-side too (see the claim's ?/save action), this is just the live UI gate.
	let attested = $state(false);
	// Local editing state for the rich-text bio (the form posts it via name="bio").
	let bio = $state(data.form.bio);
	const missing = $derived(new Set((form as { missingFields?: string[] } | undefined)?.missingFields ?? []));
	// Errored fields aren't outlined - the red * next to the label (starClass) and
	// the message under the save button do the flagging.
	const errorClass = () => 'border-border focus:border-primary focus:ring-ring';

	// Application checklist (from the layout load): a required-field label still in this
	// set is unfilled → its `*` stays red; once saved and out of the set, `*` goes muted.
	// A failed save's missingFields (field names, not labels) redden the same `*`.
	// The photo is part of ?/save itself now (multipart).
	const appMissing = $derived(new Set(data.application?.profile.missing ?? []));
	const docMissing = $derived(new Set(data.application?.documentation?.missing ?? []));
	const FIELD_BY_LABEL: Record<string, string> = {
		'First name': 'firstName',
		'Other names': 'otherNames',
		Bio: 'bio',
		'Elective position': 'positionId'
	};
	const starRed = (label: string) =>
		appMissing.has(label) || docMissing.has(label) || missing.has(FIELD_BY_LABEL[label] ?? '');
	const starClass = (label: string) => (starRed(label) ? 'text-red-500' : 'text-muted');

	// Photo: picked -> cropped -> STAGED in the ?/save form's own file input and
	// previewed locally. The actual upload rides the multipart ?/save submit, so an
	// unsaved application can pick a photo without losing its form state.
	let photoInput: HTMLInputElement | undefined = $state();
	let cropping = $state<File | null>(null);
	let stagedPhotoUrl = $state<string | null>(null); // local object URL preview

	function onPhotoChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = ''; // the cropped result replaces it on confirm
		cropping = file;
	}
	function onCropConfirm(cropped: File) {
		cropping = null;
		if (!photoInput) return;
		const dt = new DataTransfer();
		dt.items.add(cropped);
		photoInput.files = dt.files;
		if (stagedPhotoUrl) URL.revokeObjectURL(stagedPhotoUrl);
		stagedPhotoUrl = URL.createObjectURL(cropped);
	}

	let adding = $state<'leadership' | 'professional' | 'education' | null>(null);
	function toggleAdding(type: 'leadership' | 'professional' | 'education') {
		adding = adding === type ? null : type;
	}

	type PendingExperience = {
		type: 'education' | 'professional';
		title: string;
		institution: string;
		description: string;
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
	let expDescription = $state('');
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
			description: expDescription.trim(),
			from: expFrom,
			to: expTo || null
		});
		expTitle = expInstitution = expDescription = expFrom = expTo = '';
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

	<h2 class="text-xl font-bold text-heading">Leader's Profile</h2>
	<p class="text-sm text-muted">This is what citizens see on the leader's public profile/page.</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}
	<!-- Verification submission ("Submit Application") now lives in the layout,
	top-right — it's gated on Profile/Contacts/Team together, not just this page,
	so it can't live inside a single tab. -->

	<form
		method="post"
		action="?/save"
		enctype="multipart/form-data"
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
					// The staged photo is now saved server-side; data.photoUrl takes over.
					if (stagedPhotoUrl) URL.revokeObjectURL(stagedPhotoUrl);
					stagedPhotoUrl = null;
					if (photoInput) photoInput.value = '';
					// Claim family: the first save unlocks Contacts/Signoff (see the layout's
					// tab gating) — move the claimant there instead of leaving them on a
					// tab whose only job just finished. A later re-edit (e.g. after a
					// rejection) stays put so they can keep tweaking the profile.
					if (advanceOnSave) {
						await goto(page.url.pathname.replace(/\/profile$/, '/contacts'));
						return;
					}
				}
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="experienceEntries" value={JSON.stringify(pendingExperience)} />
		<input type="hidden" name="leadershipEntries" value={JSON.stringify(pendingLeadership)} />
		<input type="hidden" name="removedExperienceIds" value={JSON.stringify(removedExperienceIds)} />
		<input type="hidden" name="removedLeadershipIds" value={JSON.stringify(removedLeadershipIds)} />

		<!-- Left: name, party, IEBC certificate. Right end: photo. Both columns share a
		fixed height; the left column spreads its field groups with space-between. -->
		<div class="flex gap-5 flex-col sm:flex-row">
			<!-- Right side: fixed square photo (a fixed size beats aspect-ratio here, which
			the flex column was compressing). -->
			<div class="flex flex-col shrink-0">
				<span class="text-sm font-medium text-heading">Photo <span class={starClass('Photo')}>*</span></span>
				<label
					class="group relative mt-1.5 block aspect-square shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-surface-2 size-40 sm:size-50"
				>
					{#if stagedPhotoUrl || data.photoUrl}
						<img src={stagedPhotoUrl ?? data.photoUrl} alt="Leader" class="h-full object-cover" />
						<span
							class="absolute inset-x-0 bottom-0 bg-black/55 py-1.5 text-center text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100"
						>
							Change photo
						</span>
					{:else}
						<span class="flex h-full w-full flex-col items-center justify-center gap-1 text-center text-xs font-medium text-muted">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-7">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
							</svg>
							Upload photo
						</span>
					{/if}
					<input
						type="file"
						name="photo"
						accept="image/*"
						bind:this={photoInput}
						onchange={onPhotoChange}
						class="sr-only"
					/>
				</label>
				{#if stagedPhotoUrl}
					<p class="mt-1 max-w-36 text-xs font-medium text-muted">Uploads when you press "Save profile".</p>
				{/if}
			</div>
			<div class="flex flex-1 flex-col gap-5 sm:gap-1 sm:justify-between">
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
				{#if data.parties}
					<label class="">
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
				{#if missing.has('firstName') ||  missing.has('otherNames')}
					<p class="-mt-3 text-sm font-medium text-red-500">{form?.error}</p>
				{/if}
			</div>
		</div>

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
								description={item.description}
								dateLabel="{item.from}{item.to ? `–${item.to}` : ''}"
								onRemove={() => removeExistingExperience(item.id)}
							/>
						{/each}
						{#each pendingExperience as item, i (i)}
							{#if item.type === 'professional'}
								<ExperienceBlock
									title={item.title}
									subtitle={item.institution}
									description={item.description}
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
								description={item.description}
								dateLabel="{item.from}{item.to ? `–${item.to}` : ''}"
								onRemove={() => removeExistingExperience(item.id)}
							/>
						{/each}
						{#each pendingExperience as item, i (i)}
							{#if item.type === 'education'}
								<ExperienceBlock
									title={item.title}
									subtitle={item.institution}
									description={item.description}
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
						<label class="block">
							<span class="text-sm font-medium text-heading">Description</span>
							<textarea
								bind:value={expDescription}
								maxlength="500"
								rows="3"
								placeholder="Optional: what the role or study involved and achieved"
								class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
							></textarea>
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

		{#if claimAttestation}
			<label class="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
				<input
					type="checkbox"
					name="attested"
					value="true"
					required
					bind:checked={attested}
					class="mt-0.5 size-4 shrink-0 rounded border-border text-primary focus:ring-ring"
				/>
				<span class="text-sm text-heading">
					I confirm that I am this person, or an authorized representative acting on their
					behalf, and I understand that submitting a false or fraudulent claim may carry legal
					consequences.
				</span>
			</label>
		{/if}

		<div class="border-t border-border pt-6">
			<button
				type="submit"
				disabled={saving || (claimAttestation && !attested)}
				class="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{saving ? 'Saving…' : 'Save profile'}
			</button>
		</div>
	</form>

	{#if !data.form.hasLeader}
		<p class="mt-8 border-t border-border pt-5 text-sm text-muted">
			Save your profile to unlock the next step...
		</p>
	{/if}
</div>

{#if cropping}
	<!-- Leader photo crops to a square (1:1). -->
	<ImageCropper file={cropping} aspect={1} onconfirm={onCropConfirm} oncancel={() => (cropping = null)} />
{/if}
