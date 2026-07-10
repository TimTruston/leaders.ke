<script lang="ts">
	type Props = {
		path: string;
		name: string;
		initials: string;
		verified?: boolean;
		party?: string | null;
		partyPath?: string | null;
		positionTitle?: string;
		region?: string;
		status?: string;
		followers?: number;
		bio?: string | null;
		compact?: boolean;
	};

	let {
		path,
		name,
		initials,
		verified = false,
		party = null,
		partyPath = null,
		positionTitle,
		region,
		status,
		followers,
		bio,
		compact = false
	}: Props = $props();

	const fmt = new Intl.NumberFormat('en-KE');
</script>

<!-- The leader name uses a stretched link (after:absolute after:inset-0) so the
whole card is clickable, while the party name stays its own separate link on top. -->
<div class="group relative rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm">
	<div class="flex items-center gap-3">
		<span
			class="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-lg font-bold text-on-primary"
		>
			{initials}
		</span>
		<div class="min-w-0">
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
				<p class="relative z-10 truncate text-xs text-muted">
					{#if partyPath}
						<a href={partyPath} class="hover:text-heading hover:underline">{party}</a>
					{:else}
						{party}
					{/if}
				</p>
			{:else if status}
				<p class="truncate text-xs text-muted capitalize">{status}</p>
			{/if}
		</div>
	</div>

	{#if !compact}
		{#if positionTitle || region}
			<p class="mt-4 text-sm">{positionTitle}{positionTitle && region ? ', ' : ''}{region}</p>
		{/if}
		{#if bio}<p class="mt-2 line-clamp-2 text-sm">{bio}</p>{/if}
	{/if}
	{#if (!compact && status) || followers !== undefined}
		<div class="mt-2 flex items-center gap-2 text-xs text-muted justify-between">
			{#if !compact && status}
				<span class="rounded-full bg-surface-2 px-2 py-0.5 font-medium capitalize {status === 'incumbent' ? 'text-primary' : ''}">
					{status}
				</span>
			{/if}
			{#if followers !== undefined}
				<span>{fmt.format(followers)} followers</span>
			{/if}
		</div>
	{/if}
</div>
