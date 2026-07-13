<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Checklist driven by real campaign state; each step links to where it gets done.
	const steps = $derived([
		{
			title: 'Create your leader profile',
			description: 'Pick the seat you are vying for and add your bio.',
			href: '/dashboard/profile',
			cta: data.checklist.hasProfile ? 'Edit profile' : 'Create profile',
			done: data.checklist.hasProfile
		},
		{
			title: 'Publish your manifesto',
			description: 'Add the pillars citizens will hold you to.',
			href: '/dashboard/manifesto',
			cta: 'Edit manifesto',
			done: data.checklist.pillarCount > 0
		},
		{
			title: 'Post your first update',
			description: 'Updates appear on your public page and feed your followers.',
			href: '/dashboard/posts',
			cta: 'Write a post',
			done: data.checklist.postCount > 0
		},
		{
			title: 'Invite your team',
			description: 'Managers run the dashboard with you; ambassadors mobilize on the ground.',
			href: '/dashboard/team',
			cta: 'Invite team',
			done: data.checklist.teamCount > 0
		},
		{
			title: 'Choose a subscription',
			description: 'Pick the package for your race to unlock verification and go public.',
			href: '/pricing',
			cta: 'View pricing',
			done: false
		}
	]);

	const fmt = new Intl.NumberFormat('en-KE');
</script>

<svelte:head><title>Dashboard — leaders.ke</title></svelte:head>

{#if data.stats}
	<!-- Live campaign stats -->
	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#each [{ value: data.stats.followerCount, label: 'Followers', href: '/dashboard/followers' }, { value: data.stats.postCount, label: 'Posts', href: '/dashboard/posts' }, { value: data.stats.pillarCount, label: 'Manifesto pillars', href: '/dashboard/manifesto' }, { value: data.stats.teamCount, label: 'Team members', href: '/dashboard/team' }] as stat (stat.label)}
			<a
				href={stat.href}
				class="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary"
			>
				<p class="text-3xl font-extrabold tabular-nums text-heading">{fmt.format(stat.value)}</p>
				<p class="mt-1 text-sm text-muted">{stat.label}</p>
			</a>
		{/each}
	</div>
{/if}

<!-- Onboarding checklist -->
<div class="mt-8 rounded-2xl border border-border bg-surface p-6">
	<h2 class="text-lg font-semibold text-heading">Get your campaign live</h2>
	<p class="mt-1 text-sm text-muted">
		Five steps to a public leader page ahead of 10 August 2027.
	</p>

	<ol class="mt-6 space-y-4">
		{#each steps as step, i (step.title)}
			<li class="flex gap-4">
				<span
					class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold {step.done
						? 'bg-primary text-on-primary'
						: 'bg-surface-2 text-heading'}"
				>
					{#if step.done}✓{:else}{i + 1}{/if}
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
<div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
	{#each [{ href: '/change-password', label: 'Change password' }, { href: '/change-email', label: 'Change email' }, { href: '/delete-account', label: 'Delete account' }] as action (action.href)}
		<a
			href={action.href}
			class="rounded-2xl border border-border bg-surface p-4 text-center text-sm font-medium text-heading transition hover:border-primary hover:bg-surface-2"
		>
			{action.label}
		</a>
	{/each}
</div>
