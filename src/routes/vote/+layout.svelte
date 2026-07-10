<script lang="ts">
	let { children } = $props();
</script>

{@render children()}

<!-- Scoped disclaimer for the whole /vote/2027* experience, per KDPA/IEBC-regulation guidance. -->
<div class="border-t border-border bg-surface-2 px-4 py-4 text-center text-xs text-muted sm:px-6">
	Not an official IEBC ballot. No votes are registered, tallied or published per candidate. See
	<a href="https://www.iebc.or.ke" class="underline hover:text-heading">IEBC voter education</a>
	resources for official information.
</div>
