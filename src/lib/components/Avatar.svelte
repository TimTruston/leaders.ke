<script lang="ts">
	// A leader's face wherever the UI used to show an initials monogram: the photo
	// when the profile has one, the monogram as fallback. Size/text classes come
	// from the call site so each context keeps its own scale.
	type Props = {
		name: string;
		initials: string;
		photoUrl?: string | null;
		/** Tailwind size classes, e.g. "size-16" (+ text size for the monogram). */
		sizeClass?: string;
		textClass?: string;
	};

	let { name, initials, photoUrl = null, sizeClass = 'size-12', textClass = 'text-lg' }: Props = $props();
</script>

{#if photoUrl}
	<img src={photoUrl} alt={name} loading="lazy" class="{sizeClass} shrink-0 rounded-full border border-border object-cover" />
{:else}
	<span class="grid {sizeClass} shrink-0 place-items-center rounded-full bg-primary-soft {textClass} font-bold text-on-primary">
		{initials}
	</span>
{/if}
