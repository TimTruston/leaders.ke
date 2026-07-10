<script lang="ts">
	type Props = {
		title: string;
		href?: string;
		subtitle?: string;
		description?: string | null;
		dateLabel: string;
		unsaved?: boolean;
		pending?: boolean;
		badge?: string;
		badgeClass?: string;
		onRemove?: () => void;
	};

	let { title, href, subtitle, description, dateLabel, unsaved = false, pending = false, badge, badgeClass, onRemove }: Props = $props();
</script>

<li
	class="relative rounded-xl px-4 py-3 text-sm {pending
		? 'border border-primary/40 bg-primary-soft/30'
		: 'bg-surface-2'}"
>
	{#if href}
		<a {href} class="font-medium text-heading hover:text-primary">{title}</a>
	{:else}
		<p class="font-medium text-heading">{title}</p>
	{/if}
	<p class="flex mt-1 text-muted space-between">
		{#if description}
		<span class="italic">{description}</span>
		{:else if subtitle}
		{subtitle}
		{/if}
		<span class="ml-auto shrink-0 text-xs whitespace-nowrap">
			{dateLabel}
			{#if unsaved}<span class="font-semibold text-primary">· unsaved</span>{/if}
		</span>
	</p>

	{#if onRemove}
		<button
			type="button"
			onclick={onRemove}
			aria-label="Remove"
			class="absolute top-3 right-3 text-muted hover:text-heading"
		>
			×
		</button>
	{:else if badge}
		<span class="absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {badgeClass}">
			{badge}
		</span>
	{/if}
</li>
