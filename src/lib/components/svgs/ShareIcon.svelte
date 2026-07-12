<script lang="ts">
	let { size = 20, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg {...{ width: size, height: size }} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
	<circle cx="18" cy="5" r="3" />
	<circle cx="6" cy="12" r="3" />
	<circle cx="18" cy="19" r="3" />
	<path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
</svg>
