<script lang="ts">
	import { env } from '$env/dynamic/public';
	import Countdown from './Countdown.svelte';

	// Citizen destinations live on the vote.ke app.
	const voteBase = env.PUBLIC_VOTE_BASE_URL ?? 'https://vote.ke';

	// Site-wide footer: link directory grouped by audience, with the brand blurb
	// and the compliance line the old two-line footer carried.
	const groups = [
		{
			title: 'For leaders',
			links: [
				{ href: '/presidents', label: 'Claim Your Page' },
				{ href: '/onboard/profile', label: 'Get Onboard' },
				{ href: '/features', label: 'Features' },
				{ href: '/parties', label: 'Parties' },
				{ href: '/pricing', label: 'Pricing' },
				{ href: '/news', label: 'News' }
			]
		},
		{
			title: 'For citizens',
			links: [
				{ href: `${voteBase}/ballot`, label: 'My 2027 Vote' },
				{ href: '/presidents', label: 'Leaders' },
				{ href: '/rank/presidents', label: 'Ranks' },
				{ href: '/compare', label: 'Compare' },
				{ href: `${voteBase}/why-vote`, label: 'Why Vote?' }
			]
		},
		{
			title: 'Company',
			links: [
				{ href: '/about', label: 'About Us' },
				{ href: '/faq', label: 'FAQ' },
				{ href: '/contact-us', label: 'Contact Us' }
			]
		},
		{
			title: 'Legal',
			links: [
				{ href: '/privacy', label: 'Privacy Policy' },
				{ href: '/data-policy', label: 'Data Policy' },
				{ href: '/terms', label: 'Terms of Service' }
			]
		}
	];
</script>

<footer class="relative overflow-hidden border-t border-border bg-surface-2">
	<!-- @container here (not on <footer>): the giant "leaders.ke" background text
	below is sized in cqw units, meant to scale against THIS box's width. With
	@container on the full-bleed <footer> instead, cqw resolved against the whole
	viewport on screens wider than max-w-7xl, making the text wider than the box
	it's actually centered in — this row's own overflow-hidden then cropped it. -->
	<div class="mx-auto max-w-7xl px-4 py-10 sm:px-6 @container">
		<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
			<!-- Brand -->
			<div class="sm:col-span-2">
				<a href="/" class="text-lg font-bold text-heading">leaders.ke</a>
				<p class="mt-2 max-w-xs text-sm leading-relaxed text-muted">
					Campaign platform for Smart Kenya's leaders. For voter tools and education, visit
					<a href={voteBase} class="font-medium text-primary hover:underline">vote.ke</a>.
				</p>
				<!-- Election countdown, same block as the vote.ke footer; capped to the blurb's width -->
				<div class="mt-4 max-w-xs text-center">
					<Countdown />
				</div>
			</div>

			{#each groups as group (group.title)}
				<nav aria-label={group.title}>
					<h2 class="text-xs font-semibold tracking-wide text-heading uppercase">{group.title}</h2>
					<ul class="mt-3 space-y-2">
						{#each group.links as link (link.label)}
							<li>
								<a href={link.href} class="text-sm text-muted transition hover:text-primary">
									{link.label}
								</a>
							</li>
						{/each}
					</ul>
				</nav>
			{/each}
		</div>
		<!-- Clipped to a fixed height, top-aligned: "leaders.ke" has a descender (the
		"g"), which at this size otherwise bleeds past leading-none's line box into
		the row below. Top-aligning (not centering) inside the shorter box means only
		that descender gets clipped, not the tops of the letters. -->
		<div class="h-[16cqw] overflow-hidden">
			<a href="/"
				aria-hidden="true"
				class="flex select-none items-start justify-center gap-[0.08em] -ml-[0.1em] text-[18cqw] font-bold leading-none tracking-tighter text-primary/20"
			>
				<span class="">leaders.ke</span>
			</a>
		</div>
		<div
			class="mt-10 flex flex-col items-center justify-between gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row"
		>
			<p>© {new Date().getFullYear()} leaders.ke - Campaign platform for Smart Kenya's leaders</p>
			<p>Adhering to IEBC regulations &amp; the Data Protection Act (2019)</p>
		</div>
	</div>
</footer>
