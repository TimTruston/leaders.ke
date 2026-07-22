<script lang="ts">
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// The wizard's 3 steps — forward-only. Each step's own submit is what unlocks
	// and navigates to the next (onboard -> plans -> checkout); this header is a
	// progress indicator, not a nav control, so only a COMPLETED step links back.
	const steps = [
		{ path: '/onboard/profile', label: 'Create a Profile' },
		{ path: '/onboard/plan', label: 'Pick your Plan' },
		{ path: '/onboard/checkout', label: 'Complete Payment' }
	];
	const currentIndex = $derived(steps.findIndex((s) => page.url.pathname.startsWith(s.path)));
</script>

<section class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<ol class="flex items-center justify-between gap-2">
		{#each steps as step, i (step.path)}
			<li class="flex flex-1 items-center gap-2">
				<div class="flex items-center gap-2 {i > currentIndex ? 'opacity-40' : ''}">
					<span class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold {i < currentIndex ? 'bg-primary text-on-primary' : i === currentIndex ? 'border-2 border-primary text-primary' : 'border border-border text-muted'}">
						{i < currentIndex ? '✓' : i + 1}
					</span>
					{#if i < currentIndex}
						<!-- Carries the CURRENT step's query string back to the earlier step (it's a
						superset of what that step needs, e.g. Plan/Checkout hold every field Profile
						collected) so stepping back restores the form instead of a blank one. -->
						<a href={`${step.path}${page.url.search}`} class="text-sm font-medium text-heading hover:text-primary">{step.label}</a>
					{:else}
						<span class="text-sm font-medium {i === currentIndex ? 'text-heading' : 'text-muted'}">{step.label}</span>
					{/if}
				</div>
				{#if i < steps.length - 1}<div class="h-px flex-1 {i < currentIndex ? 'bg-primary' : 'bg-border'}"></div>{/if}
			</li>
		{/each}
	</ol>

	<div class="mt-8">
		{@render children()}
	</div>
</section>
