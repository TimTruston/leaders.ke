<script lang="ts">
	import { enhance } from '$app/forms';
	import PositionSelector from '$lib/components/PositionSelector.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Form state (kept in $state so the live matcher and the confirm gate can react).
	// Prefilled from data.defaults: the claim target's name when arriving via "Claim
	// this profile" (?profile=<slug>), else the citizen's own.
	let firstName = $state(form?.values?.firstName ?? data.defaults.firstName ?? '');
	let otherNames = $state(form?.values?.otherNames ?? data.defaults.otherNames ?? '');
	let status = $state(form?.values?.status ?? '');
	let myRole = $state(form?.values?.myRole ?? '');
	// "none" (not "") is the Independent option's value — a `required` select treats an
	// empty-string value as unset regardless of whether the option was explicitly chosen,
	// so Independent needs its own non-empty sentinel to satisfy the required check.
	let partyId = $state<string>(form?.values?.partyId ? String(form.values.partyId) : '');
	let positionId = $state<number | ''>(form?.values?.positionId ?? '');
	let nationalId = $state(form?.values?.nationalId ?? '');

	// Profile Matcher (RHS): fetched live as the name fills in.
	type Match = {
		subjectUserId: number;
		name: string;
		initials: string;
		slug: string;
		photoUrl: string | null;
		party: string | null;
		positionTitle: string;
		region: string;
		status: string;
		previewPath: string;
	};
	let matches = $state<Match[]>([]);
	let matching = $state(false);
	let selectedSubjectId = $state<number | null>(form?.values?.linkSubjectId ?? null);
	let legalConfirmed = $state(false);
	let submitting = $state(false);

	// Debounced name -> matches lookup.
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const first = firstName.trim();
		const other = otherNames.trim();
		clearTimeout(timer);
		if (!first && !other) {
			matches = [];
			return;
		}
		matching = true;
		timer = setTimeout(async () => {
			try {
				const res = await fetch(`/onboard/profile/matches?first=${encodeURIComponent(first)}&other=${encodeURIComponent(other)}`);
				if (res.ok) {
					matches = (await res.json()).matches;
					// Drop a stale selection if the matched set no longer contains it.
					if (selectedSubjectId && !matches.some((m) => m.subjectUserId === selectedSubjectId)) selectedSubjectId = null;
					// Arrived via "Claim this profile" — auto-select that card once it
					// surfaces in the matcher, so the claimant just confirms + submits.
					if (data.preselectSubjectId && !selectedSubjectId && matches.some((m) => m.subjectUserId === data.preselectSubjectId)) {
						selectedSubjectId = data.preselectSubjectId;
					}
				}
			} finally {
				matching = false;
			}
		}, 350);
		return () => clearTimeout(timer);
	});

	function toggleSelect(id: number) {
		selectedSubjectId = selectedSubjectId === id ? null : id;
		legalConfirmed = false;
	}

	// Can't submit a claim until the legal box is ticked; a fresh create has no gate.
	const canSubmit = $derived(!selectedSubjectId || legalConfirmed);
</script>

<svelte:head><title>Create Your Profile</title></svelte:head>

<div class="mx-auto max-w-5xl">
	<h1 class="text-2xl font-bold text-heading">Create Your Profile</h1>
	<p class="mt-1 text-sm text-muted">Describe the leader below. If they already have a page, link it instead of creating a duplicate.</p>

	{#if form?.error}
		<p class="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">{form.error}</p>
	{/if}

	<form method="post" use:enhance={() => { submitting = true; return async ({ update }) => { await update({ reset: false }); submitting = false; }; }} class="mt-6 grid gap-4 lg:gap-8 lg:grid-cols-2">
		<!-- LHS: describe the leader -->
		<div class="space-y-4">
			<h2 class="text-sm font-semibold text-heading">Describe the leader below…</h2>

			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="text-sm font-medium text-heading">First name</span>
					<input name="firstName" bind:value={firstName} required class="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:outline-none" />
				</label>
				<label class="block">
					<span class="text-sm font-medium text-heading">Other names</span>
					<input name="otherNames" bind:value={otherNames} required class="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:outline-none" />
				</label>
			</div>

			<fieldset>
				<legend class="text-sm font-medium text-heading">Has the leader ever been elected before?</legend>
				<div class="mt-2 space-y-2">
					{#each data.statusOptions as opt (opt.value)}
						<label class="flex items-center gap-2 text-sm text-heading">
							<input type="radio" name="status" value={opt.value} bind:group={status} required class="text-primary focus:ring-ring" />
							{opt.label}
						</label>
					{/each}
				</div>
			</fieldset>

			<label class="block">
				<span class="text-sm font-medium text-heading">Party</span>
				<select name="partyId" bind:value={partyId} required class="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:outline-none">
					<option value="" disabled>Select a party…</option>
					<option value="none">Independent / none</option>
					{#each data.parties as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
				</select>
			</label>

			<PositionSelector positions={data.positions} verified={false} initialPositionId={positionId || null} bind:value={positionId} />

			<label class="block">
				<span class="text-sm font-medium text-heading">My role</span>
				<select name="myRole" bind:value={myRole} required class="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:outline-none">
					<option value="" disabled>Select your role…</option>
					{#each data.roles as role (role)}<option value={role}>{role}</option>{/each}
				</select>
			</label>

			<label class="block">
				<span class="text-sm font-medium text-heading">National ID <span class="text-muted">· Sign off</span></span>
				<input name="nationalId" bind:value={nationalId} inputmode="numeric" pattern={'[0-9]{7,8}'} maxlength="8" required placeholder="7–8 digits" class="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:outline-none" />
			</label>
		</div>

		<!-- RHS: Matching Profiles -->
		<div class="space-y-3">
			<h2 class="text-sm font-semibold text-heading">Matching profiles</h2>
			{#if !firstName.trim() && !otherNames.trim()}
				<p class="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">Fill the form to see matching profiles.</p>
			{:else if matching && matches.length === 0}
				<p class="text-sm text-muted">Searching…</p>
			{:else if matches.length === 0}
				<p class="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">No matching profile — we'll create a new one for you.</p>
			{:else}
				<p class="text-sm text-muted">Select a card below if it matches your profile.</p>
				<div class="space-y-2">
					{#each matches as m (m.subjectUserId)}
						<label class="flex items-center gap-3 rounded-xl border px-3 py-2 transition {selectedSubjectId === m.subjectUserId ? 'border-primary bg-primary-soft' : 'border-border'}">
							<input type="checkbox" checked={selectedSubjectId === m.subjectUserId} onchange={() => toggleSelect(m.subjectUserId)} class="text-primary focus:ring-ring" />
							<div class="flex min-w-0 flex-1 items-center gap-3">
								<Avatar name={m.name} initials={m.initials} photoUrl={m.photoUrl} sizeClass="size-10" textClass="text-sm" />
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-heading">{m.name}</p>
									<p class="truncate text-xs text-muted">{[m.positionTitle, m.region].filter(Boolean).join(', ') || 'No seat on record'}{m.party ? ` · ${m.party}` : ''}</p>
								</div>
							</div>
							<a href={m.previewPath} target="_blank" rel="noopener" class="shrink-0 text-xs font-semibold text-primary hover:underline">Preview &#8599;</a>
						</label>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Hidden link target: set only when a matching card is confirmed. -->
		<input type="hidden" name="leaderId" value={selectedSubjectId ?? ''} />

		{#if selectedSubjectId}
		<label class="flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs text-heading">
			<input type="checkbox" bind:checked={legalConfirmed} class="mt-0.5 text-primary focus:ring-ring" />
			I confirm that I am this leader or an authorised representative and I understand that falsely claiming a profile may have legal consequences.
		</label>
		{/if}

		<div class="lg:col-span-2">
			<button type="submit" disabled={!canSubmit || submitting} class="mt-3 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-50">
				{submitting ? 'Saving…' : selectedSubjectId ? 'Link & continue' : 'Create & continue'}
			</button>
		</div>
	</form>
</div>
