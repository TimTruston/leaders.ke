<script lang="ts">
	let { children } = $props();
</script>

<!-- Fills the viewport below the sticky h-16 header (scoped here — sizing the root
<main> globally shifted other views): content takes the remaining height so the
disclaimer sits at the bottom even on short pages, and sticky pins it to the
viewport bottom while scrolling long ballots. -->
<div class="flex min-h-[calc(100dvh-4rem)] flex-col">
	<div class="flex-1">
		{@render children()}
	</div>

	<!-- Scoped disclaimer for the whole /vote/2027* experience, per KDPA/IEBC-regulation guidance. -->
	<div class="sticky bottom-0 z-20 border-t border-border bg-surface-2 px-4 py-4 text-center text-xs text-muted sm:px-6">
		Not an official IEBC ballot. No votes are registered, tallied or published per candidate. See
		<a href="https://www.iebc.or.ke" class="underline hover:text-heading">IEBC voter education</a>
		resources for official information.
	</div>
</div>
