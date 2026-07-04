<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Candidate journey from the blueprint: sign up -> create campaign -> pay -> verify -> go public.
	// Static shell for now; CTAs point at routes that land as they're built.
	const steps = [
		{
			title: 'Complete your profile',
			description: 'Add your bio, photo and contacts so citizens recognise you.',
			href: '/profile',
			cta: 'Edit profile'
		},
		{
			title: 'Create your campaign',
			description: 'One main campaign per candidate. It stays private until verified and paid.',
			href: '/campaigns/new',
			cta: 'Create campaign'
		},
		{
			title: 'Choose a subscription',
			description: 'Pick Aspirant, Contender or Statesman to unlock your public page.',
			href: '/pricing',
			cta: 'View pricing'
		},
		{
			title: 'Submit for verification',
			description: 'Upload your ID, IEBC application and party proof for admin review.',
			href: '/verify',
			cta: 'Start verification'
		},
		{
			title: 'Go public',
			description: 'Once verified and paid, your leader page and campaign go live.',
			href: '/leaders',
			cta: 'Preview'
		}
	];
</script>

<svelte:head><title>Dashboard — leaders.ke</title></svelte:head>

<section class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
	<!-- Greeting + verification status -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold text-heading">Welcome, {data.firstName}</h1>
			<p class="mt-1 text-sm text-muted">{data.email}</p>
		</div>
		{#if data.verifiedAt}
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-on-primary"
			>
				✓ Verified
			</span>
		{:else}
			<span
				class="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-on-primary"
			>
				Unverified
			</span>
		{/if}
	</div>

	<!-- Onboarding checklist -->
	<div class="mt-8 rounded-2xl border border-border bg-surface p-6">
		<h2 class="text-lg font-semibold text-heading">Get your campaign live</h2>
		<p class="mt-1 text-sm text-muted">Five steps to a public leader page ahead of 10 August 2027.</p>

		<ol class="mt-6 space-y-4">
			{#each steps as step, i (step.title)}
				<li class="flex gap-4">
					<span
						class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-heading"
					>
						{i + 1}
					</span>
					<div class="flex flex-1 flex-wrap items-center justify-between gap-2">
						<div class="min-w-0">
							<p class="font-medium text-heading">{step.title}</p>
							<p class="text-sm text-muted">{step.description}</p>
						</div>
						<a
							href={step.href}
							class="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-heading transition hover:bg-surface-2"
						>
							{step.cta}
						</a>
					</div>
				</li>
			{/each}
		</ol>
	</div>

	<!-- Quick account actions -->
	<div class="mt-6 grid gap-4 sm:grid-cols-3">
		{#each [{ href: '/change-password', label: 'Change password' }, { href: '/change-email', label: 'Change email' }, { href: '/', label: 'Back to site' }] as action (action.href)}
			<a
				href={action.href}
				class="rounded-2xl border border-border bg-surface p-4 text-center text-sm font-medium text-heading transition hover:border-primary hover:bg-surface-2"
			>
				{action.label}
			</a>
		{/each}
	</div>
</section>
