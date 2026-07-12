<script lang="ts">
	let { size = 18, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg {...{ width: size, height: size }} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
	<rect x="3" y="3" width="18" height="18" rx="5" />
	<circle cx="12" cy="12" r="4" />
	<circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
</svg>
