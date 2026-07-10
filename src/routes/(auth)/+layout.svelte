<script lang="ts">
	let { children } = $props();
</script>

<!-- Centered container shared by every small auth form. Nests inside the root layout,
     so the site Header/footer stay available; the brand link doubles as a route home. -->
<div class="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12">
	<a href="/" class="mb-10 flex items-center gap-2 text-2xl font-semibold text-heading">
		<span class="grid size-8 place-items-center rounded-lg bg-primary text-on-primary">L</span>
		<span>leaders<span class="text-primary">.ke</span></span>
	</a>
	{@render children()}
</div>
