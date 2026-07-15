<script lang="ts">
	// Site-wide footer: link directory grouped by audience, with the brand blurb
	// and the compliance line the old two-line footer carried.
	// "Create a Profile" mints a fresh application id per render — same pattern as
	// the dashboard's "Launch a Campaign" button (/dashboard/apply/<uuid>/*).
	const launchHref = `/dashboard/apply/${crypto.randomUUID()}/profile`;

	const groups = [
		{
			title: 'For leaders',
			links: [
				{ href: launchHref, label: 'Create a Profile' },
				{ href: '/leaders', label: 'Claim Your Page' },
				{ href: '/features', label: 'Features' },
				{ href: '/pricing', label: 'Pricing' }
			]
		},
		{
			title: 'For citizens',
			links: [
				{ href: '/leaders', label: 'Leaders' },
				{ href: '/ranks', label: 'Ranks' },
				{ href: '/compare', label: 'Compare' },
				{ href: '/why-vote', label: 'Why Vote?' }
			]
		},
		{
			title: 'Company',
			links: [
				{ href: '/about', label: 'About Us' },
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

<footer class="border-t border-border bg-surface-2">
	<div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
		<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
			<!-- Brand -->
			<div class="sm:col-span-2">
				<a href="/" class="text-lg font-bold text-heading">leaders.ke</a>
				<p class="mt-2 max-w-xs text-sm leading-relaxed text-muted">
					The digital town hall of Kenya: a neutral civic information directory connecting
					citizens and the leaders who serve them.
				</p>
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

		<div
			class="mt-10 flex flex-col items-center justify-between gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row"
		>
			<p>© {new Date().getFullYear()} leaders.ke - Neutral civic information directory</p>
			<p>Adhering to IEBC regulations &amp; the Data Protection Act (2019)</p>
		</div>
	</div>
</footer>
