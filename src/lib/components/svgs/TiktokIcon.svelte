<script lang="ts">
	let { size = 18, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg {...{ width: size, height: size }} viewBox="0 0 24 24" fill="currentColor" class={className}><path d="M16.5 3c.3 2 1.6 3.6 3.5 4v2.6c-1.3 0-2.5-.4-3.6-1v6.1a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.07v2.8a3 3 0 1 0 2.1 2.86V3h2.9z"/></svg>
