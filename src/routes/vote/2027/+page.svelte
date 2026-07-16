<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import GeoSelect from '$lib/components/GeoSelect.svelte';
	import type { BallotLevel } from '$lib/server/ballot';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const LEVEL_LABEL: Record<BallotLevel, string> = {
		president: 'President',
		governor: 'Governor',
		senator: 'Senator',
		womanRep: 'Woman Representative',
		mp: 'Member of Parliament',
		mca: 'Member of County Assembly'
	};

	let county = $state(data.countySlug);
	let constituency = $state(data.constituencySlug);
	let ward = $state(data.wardSlug);

	// Keep local selects in sync with the URL (browser back/forward, direct links).
	$effect(() => {
		county = data.countySlug;
		constituency = data.constituencySlug;
		ward = data.wardSlug;
	});

	function onGeoChange() {
		const params = new URLSearchParams();
		if (county) params.set('county', county);
		if (constituency) params.set('constituency', constituency);
		if (ward) params.set('ward', ward);
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	// One candidateId (or null if skipped) per level; `decided` gates the submit button.
	let selections = $state<Record<BallotLevel, string | null>>({
		president: null,
		governor: null,
		senator: null,
		womanRep: null,
		mp: null,
		mca: null
	});
	let decided = $state<Record<BallotLevel, boolean>>({
		president: false,
		governor: false,
		senator: false,
		womanRep: false,
		mp: false,
		mca: false
	});

	const allDecided = $derived(Object.values(decided).every(Boolean));

	function pick(level: BallotLevel, candidateId: string, index: number) {
		selections[level] = candidateId;
		decided[level] = true;
		scrollToNext(index);
	}

	function skip(level: BallotLevel, index: number) {
		selections[level] = null;
		decided[level] = true;
		scrollToNext(index);
	}

	function scrollToNext(index: number) {
		const nextId = index + 1 < data.levels.length ? `level-${data.levels[index + 1].level}` : 'ballot-details';
		requestAnimationFrame(() => {
			document.getElementById(nextId)?.scrollIntoView({ behavior: 'smooth' });
		});
	}

	let pollingStation = $state('');
	let voterName = $state('');
	let voterContact = $state('');
	let consentedToContact = $state(false);
</script>

<svelte:head>
	<title>2027 Ballot Simulator — leaders.ke</title>
	<meta
		name="description"
		content="See every verified candidate you'd vote for in 2027 across all six elective levels, cast a simulated ballot, and share your result."
	/>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
	<h1 class="text-2xl font-bold text-heading sm:text-3xl">2027 Ballot Simulator</h1>
	<p class="mt-2 text-sm">
		Pick your county, constituency and ward to see every verified candidate you'd vote for.
	</p>

	<div
		class="mt-4 rounded-lg border border-primary/40 bg-primary-soft px-4 py-3 text-sm text-on-primary"
	>
		This is a simulated voting experience for the 2027 General Election. It does not register your
		vote or affect the official result.
	</div>

	<div class="mt-6">
		<GeoSelect bind:county bind:constituency bind:ward onchange={onGeoChange} />
	</div>
</div>

{#if data.geoReady}
	<form
		method="post"
		use:enhance
		class="contents"
		onsubmit={(e) => {
			// Keep the hidden JSON in sync right before submit (selections is mutated in place above).
			const el = e.currentTarget.querySelector<HTMLInputElement>('input[name="selections"]');
			if (el) el.value = JSON.stringify(selections);
		}}
	>
		<input type="hidden" name="county" value={county} />
		<input type="hidden" name="constituency" value={constituency} />
		<input type="hidden" name="ward" value={ward} />
		<input type="hidden" name="selections" value={JSON.stringify(selections)} />

		{#each data.levels as { level, candidates }, i (level)}
			<section
				id="level-{level}"
				class="mx-auto flex min-h-svh max-w-3xl scroll-mt-6 flex-col justify-center px-4 py-12 sm:px-6"
			>
				<p class="text-xs font-semibold tracking-wide text-primary uppercase">
					{i + 1} of {data.levels.length}
				</p>
				<h2 class="mt-1 text-xl font-bold text-heading sm:text-2xl">{LEVEL_LABEL[level]}</h2>

				{#if candidates.length === 0}
					<p class="mt-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
						No verified candidates yet for this seat. Check back closer to the election.
					</p>
				{:else}
					<div class="mt-4 grid gap-3 sm:grid-cols-2">
						{#each candidates as candidate (candidate.candidateId)}
							<button
								type="button"
								onclick={() => pick(level, candidate.candidateId, i)}
								class="flex items-center gap-3 rounded-2xl border p-4 text-left transition {selections[
									level
								] === candidate.candidateId
									? 'border-primary bg-primary-soft'
									: 'border-border bg-surface hover:border-primary'}"
							>
								<Avatar name={candidate.name} initials={candidate.initials} photoUrl={candidate.photoUrl} sizeClass="size-12" textClass="text-sm" />
								<span>
									<span class="flex items-center gap-1 font-semibold text-heading">
										{candidate.name}
										{#if candidate.verified}
											<svg viewBox="0 0 24 24" fill="currentColor" class="size-4 text-primary">
												<path
													fill-rule="evenodd"
													d="M8.6 3.8a4.5 4.5 0 0 0-1.4 1 4.5 4.5 0 0 0-3.8 3.7 4.5 4.5 0 0 0 0 5 4.5 4.5 0 0 0 3.7 3.8 4.5 4.5 0 0 0 5 0 4.5 4.5 0 0 0 3.8-3.7 4.5 4.5 0 0 0 0-5 4.5 4.5 0 0 0-3.7-3.8 4.5 4.5 0 0 0-3.6-1Zm7 6.7a.75.75 0 1 0-1.2-.9l-3.2 4.3-1.7-1.7a.75.75 0 1 0-1 1l2.3 2.4a.75.75 0 0 0 1.1-.1l3.7-5Z"
													clip-rule="evenodd"
												/>
											</svg>
										{/if}
									</span>
									{#if candidate.party}<span class="block text-xs text-muted">{candidate.party}</span
										>{/if}
								</span>
							</button>
						{/each}
					</div>
				{/if}

				<button
					type="button"
					onclick={() => skip(level, i)}
					class="mt-4 w-fit text-sm font-medium text-muted underline-offset-2 hover:text-heading hover:underline"
				>
					{selections[level] ? 'Change to no selection' : 'Skip this seat'}
				</button>
			</section>
		{/each}

		<!-- Optional details -->
		<section id="ballot-details" class="mx-auto max-w-3xl scroll-mt-6 px-4 py-12 sm:px-6">
			<h2 class="text-xl font-bold text-heading">Optional: stay in the loop</h2>
			<p class="mt-1 text-sm text-muted">
				Leave your details if you'd like to be notified when a candidate you didn't see joins. Under
				the Kenya Data Protection Act (2019), this is entirely optional and never shown on your
				shared ballot.
			</p>

			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				<input
					type="text"
					bind:value={voterName}
					name="voterName"
					placeholder="Name (optional)"
					class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
				<input
					type="text"
					bind:value={voterContact}
					name="voterContact"
					placeholder="Phone or email (optional)"
					class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</div>
			<label class="mt-3 flex items-start gap-2 text-sm">
				<input
					type="checkbox"
					bind:checked={consentedToContact}
					name="consentedToContact"
					class="mt-0.5"
				/>
				<span>I consent to leaders.ke contacting me about candidates in my area (KDPA opt-in).</span>
			</label>

			<input
				type="text"
				bind:value={pollingStation}
				name="pollingStation"
				placeholder="Polling station (optional — not yet published by IEBC for 2027)"
				class="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
			/>

			{#if form?.message}
				<p class="mt-4 text-sm text-red-500">{form.message}</p>
			{/if}

			<button
				type="submit"
				disabled={!allDecided}
				class="mt-6 w-full rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
			>
				Cast my simulated vote
			</button>
			{#if !allDecided}
				<p class="mt-2 text-center text-xs text-muted">
					Pick or skip all six seats above to unlock this button.
				</p>
			{/if}
		</section>
	</form>
{/if}
