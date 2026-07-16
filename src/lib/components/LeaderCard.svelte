<script lang="ts">
	import { goto } from '$app/navigation';
	import Avatar from '$lib/components/Avatar.svelte';
	import { compareSelection, clearCompareSelection } from '$lib/stores/compare.svelte';
	import { plainText } from '$lib/utils/richtext';
	import { seatPath } from '$lib/utils/seat';

	type Props = {
		path: string;
		name: string;
		initials: string;
		photoUrl?: string | null;
		verified?: boolean;
		party?: string | null;
		partyPath?: string | null;
		positionTitle?: string;
		region?: string;
		status?: string;
		followers?: number;
		bio?: string | null;
		compact?: boolean;
		/** Header-card variant (e.g. /compare): card-height photo, bio in the right column. */
		large?: boolean;
	};

	let {
		path,
		name,
		initials,
		photoUrl = null,
		verified = false,
		party = null,
		partyPath = null,
		positionTitle,
		region,
		status,
		followers,
		bio,
		compact = false,
		large = false
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-KE');

	// Compare affordance ([<>] top right): first click selects this leader as A;
	// with an A live, every other card offers B on hover, and clicking B lands on
	// /compare with both. Clicking A again unselects.
	const isSelected = $derived(compareSelection.path === path);
	const otherSelected = $derived(!!compareSelection.path && !isSelected);

	function onCompareClick() {
		if (isSelected) {
			clearCompareSelection();
		} else if (compareSelection.path) {
			const a = compareSelection.path;
			clearCompareSelection();
			goto(`/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(path)}`);
		} else {
			compareSelection.path = path;
			compareSelection.name = name;
		}
	}
</script>

<!-- The leader name uses a stretched link (after:absolute after:inset-0) so the
whole card is clickable, while the party name stays its own separate link on top. -->
<div class="group relative rounded-2xl border border-border bg-surface transition hover:border-primary hover:shadow-sm {large ? 'p-6' : 'p-5'}">
	<!-- Compare trigger: z-10 keeps it clickable above the card's stretched link. -->
	<button
		type="button"
		onclick={onCompareClick}
		title={isSelected
			? 'Unselect from comparison'
			: otherSelected
				? `Compare with ${compareSelection.name}`
				: 'Select to compare'}
		aria-label={isSelected
			? 'Unselect from comparison'
			: otherSelected
				? `Compare with ${compareSelection.name}`
				: 'Select to compare'}
		aria-pressed={isSelected}
		class="absolute top-3 right-3 z-10 grid size-7 place-items-center rounded-full border font-mono text-xs font-bold transition
			{isSelected
			? 'border-primary bg-primary text-on-primary'
			: 'border-border bg-surface text-muted hover:border-primary hover:text-primary'}"
	>
		{#if isSelected}
			A
		{:else if otherSelected}
			<!-- With an A selected elsewhere, hovering this card offers the B slot. -->
			<span class="group-hover:hidden">&lt;&gt;</span>
			<span class="hidden group-hover:inline">B</span>
		{:else}
			&lt;&gt;
		{/if}
	</button>
	<div class="flex items-center {large ? 'gap-5 flex-col lg:flex-row' : 'gap-3'}" >
		<!-- In the large variant the photo spans the card's height. -->
		<Avatar {name} {initials} {photoUrl} sizeClass={large ? 'size-40' : 'size-24'} textClass={large ? 'text-4xl' : 'text-xl'} />
		<div class="w-full min-w-0">
			<a href={path} class="flex items-center gap-1 font-semibold text-heading after:absolute after:inset-0 group-hover:text-primary">
				<span class="truncate">{name}</span>
				{#if verified}
					<svg viewBox="0 0 24 24" fill="currentColor" class="size-4 shrink-0 text-primary" aria-label="Verified">
						<path
							fill-rule="evenodd"
							d="M8.6 3.8a4.5 4.5 0 0 0-1.4 1 4.5 4.5 0 0 0-3.8 3.7 4.5 4.5 0 0 0 0 5 4.5 4.5 0 0 0 3.7 3.8 4.5 4.5 0 0 0 5 0 4.5 4.5 0 0 0 3.8-3.7 4.5 4.5 0 0 0 0-5 4.5 4.5 0 0 0-3.7-3.8 4.5 4.5 0 0 0-3.6-1Zm7 6.7a.75.75 0 1 0-1.2-.9l-3.2 4.3-1.7-1.7a.75.75 0 1 0-1 1l2.3 2.4a.75.75 0 0 0 1.1-.1l3.7-5Z"
							clip-rule="evenodd"
						/>
					</svg>
				{/if}
			</a>
			{#if party}
				<p class="relative z-10 truncate {large ? 'my-1 text-sm' : 'text-xs'} text-muted">
					{#if partyPath}
						<a href={partyPath} class="hover:text-heading hover:underline">{party}</a>
					{:else}
						{party}
					{/if}
				</p>
			{/if}
			{#if positionTitle || region}
				{@const seat = seatPath(positionTitle, region)}
				<p class="mt-2 text-xs flex items-center gap-2">
					{#if status}
						<span class="rounded-full bg-surface-2 px-2 py-0.5 font-medium capitalize {status === 'current' ? 'text-primary' : ''}">
							{status}
						</span>
					{/if}
					{#if seat}
						<!-- z-10 keeps the seat link clickable above the card's stretched link. -->
						<a href={seat} class="relative z-10 hover:text-primary">
							{positionTitle}{positionTitle && region ? ', ' : ''}{region}
						</a>
					{:else}
						{positionTitle}{positionTitle && region ? ', ' : ''}{region}
					{/if}
				</p>
			{/if}
			{#if !compact || followers !== undefined}
				<div class="mt-2 flex w-full items-center gap-2 text-xs text-muted justify-between">
					
					{#if followers !== undefined}
						<span>{fmt.format(followers)} followers</span>
					{/if}
				</div>
			{/if}
			{#if large && bio}
				<!-- Large variant: the bio sits in the right column, under name/seat/party. -->
				{@const text = plainText(bio)}
				<p class="mt-3 text-sm leading-relaxed">{text.slice(0, 200)}{text.length > 200 ? '…' : ''}</p>
			{/if}
		</div>
	</div>

	{#if !compact && !large}
		{#if bio}<p class="mt-2 line-clamp-2 text-sm">{plainText(bio)}</p>{/if}
	{/if}

</div>
