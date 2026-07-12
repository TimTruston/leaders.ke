<script lang="ts">
	let { size = 18, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg {...{ width: size, height: size }} viewBox="0 0 24 24" fill="currentColor" class={className}><path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5-6.5L5.5 22H2.4l8-9.2L1.6 2h6.9l4.5 6L18.9 2zm-2.4 18h1.8L7.6 3.9H5.7L16.5 20z"/></svg>
