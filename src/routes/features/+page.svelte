<script lang="ts">
	// The full feature list, grouped by the buyer's jobs-to-be-done (see docs/PRIORITIES.md
	// and .ignore/01-homepage-features-v1-redesign.md). `live` features are shipped; the
	// rest are roadmap and badged "Coming soon" — the badge doubles as a demand test.
	// `tier` is the lowest package that includes the feature.

	type Feature = {
		name: string;
		description: string;
		tier: 'Aspirant' | 'Influencer' | 'Mobilizer' | 'Public';
		live: boolean;
	};

	type Group = {
		name: string;
		blurb: string;
		features: Feature[];
	};

	const groups: Group[] = [
		{
			name: 'Get known',
			blurb: 'The credibility layer: a verified presence citizens can find and trust.',
			features: [
				{
					name: 'Verified profile',
					description:
						'A public page verified against IEBC records, with your photo, party, bio and a clean URL like leaders.ke/muranga/mca/john-njagi.',
					tier: 'Aspirant',
					live: true
				},
				{
					name: 'Manifesto',
					description:
						'Publish your manifesto as clear pillars citizens can read, share and hold you to.',
					tier: 'Aspirant',
					live: true
				},
				{
					name: 'Featured placement',
					description:
						'Buy placement on the leaders.ke homepage and directory, seen by every visitor.',
					tier: 'Aspirant',
					live: true
				},
				{
					name: 'Campaign page',
					description:
						'A public page for your campaign: mission, posts, events and the team behind it.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Campaign CMS',
					description:
						'A dashboard where you and your team create posts, upload media and manage every public page.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Managers & ambassadors',
					description:
						'Invite campaign managers with roles, and ambassadors who mobilize on the ground.',
					tier: 'Aspirant',
					live: false
				}
			]
		},
		{
			name: 'Build your base',
			blurb: 'Turn page visitors into an audience you own and can reach any day.',
			features: [
				{
					name: 'Followers',
					description:
						'Citizens follow your page with just a name and phone or email, no account needed.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Broadcast channel',
					description:
						'A one-way channel on your profile where followers get every update, like a town-hall noticeboard.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Broadcasting',
					description:
						'Compose once and reach followers via email, SMS and WhatsApp using prepaid credits.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Geographic targeting',
					description:
						'Send a broadcast to one ward or constituency only; an MCA race is won street by street.',
					tier: 'Influencer',
					live: false
				}
			]
		},
		{
			name: 'Prove yourself',
			blurb: 'Social proof and receipts: show citizens why you, and show it publicly.',
			features: [
				{
					name: 'Citizen reviews',
					description:
						'Citizens rate and review your leadership publicly, pillar by pillar.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Review responses',
					description:
						'Respond to citizen reviews directly and publish case studies of delivered work.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Track record page',
					description:
						'A timeline of every term you have served, each with its own page and record.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Manifesto delivery tracker',
					description:
						'Each manifesto pillar gets a public status: promised, in progress or delivered, with evidence.',
					tier: 'Influencer',
					live: false
				}
			]
		},
		{
			name: 'Raise money',
			blurb: 'Fund the campaign from the same page that grows your following.',
			features: [
				{
					name: 'Campaign fundraising',
					description:
						'Collect donations via M-Pesa straight from your profile, with a public goal tracker.',
					tier: 'Influencer',
					live: false
				},
				{
					name: 'Vote pledges',
					description:
						'Citizens pledge their vote to your campaign from the ballot simulator, counted live.',
					tier: 'Aspirant',
					live: false
				}
			]
		},
		{
			name: 'Manage your PR',
			blurb: 'Know what the press says about you the hour it happens, and answer in kind.',
			features: [
				{
					name: 'News aggregation',
					description:
						'Daily monitoring of verified media, with every mention tagged to your profile.',
					tier: 'Aspirant',
					live: false
				},
				{
					name: 'Draft responses',
					description:
						'AI-drafted responses to coverage, queued for your approval before anything goes out.',
					tier: 'Influencer',
					live: false
				},
				{
					name: 'PR crisis alerts',
					description:
						'When negative mentions spike, your team gets alerted immediately with a suggested response.',
					tier: 'Mobilizer',
					live: false
				},
				{
					name: 'Social media integration',
					description:
						'Connect X and Facebook to cross-post broadcasts and approved responses in one click.',
					tier: 'Influencer',
					live: false
				}
			]
		},
		{
			name: 'Outrun opponents',
			blurb: 'The race is relative: see exactly where you stand and where they are weak.',
			features: [
				{
					name: 'Competitor watch',
					description:
						'Track rivals for your seat: their posts, follower growth and news coverage in one dashboard.',
					tier: 'Mobilizer',
					live: false
				},
				{
					name: 'Leader ranks',
					description:
						'Public rankings by engagement, delivery score and follower growth, per position and region.',
					tier: 'Public',
					live: false
				},
				{
					name: 'Side-by-side comparisons',
					description:
						'Compare governor to governor across regions, or one seat across regimes in the same region.',
					tier: 'Public',
					live: false
				}
			]
		},
		{
			name: 'Scale engagement',
			blurb: 'Answer every constituent without hiring a call center.',
			features: [
				{
					name: 'AI constituent chat',
					description:
						'An AI on your profile answers constituent questions from your manifesto, documents and posts, and escalates the hard ones to your team.',
					tier: 'Influencer',
					live: false
				}
			]
		}
	];

	// Tier badge colors: Public features are free to read; paid tiers use the primary scale.
	const tierClass: Record<Feature['tier'], string> = {
		Public: 'bg-surface-2 text-muted border border-border',
		Aspirant: 'bg-primary-soft text-on-primary',
		Influencer: 'bg-primary-soft text-on-primary',
		Mobilizer: 'bg-primary text-on-primary'
	};
</script>

<svelte:head>
	<title>Features — leaders.ke</title>
	<meta
		name="description"
		content="Everything a 2027 campaign needs: verified profiles, followers and broadcasts, citizen reviews, vote pledges, fundraising, PR management, AI chat and competitor analytics."
	/>
</svelte:head>

<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="">
		<h1 class="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
			Everything a campaign needs
		</h1>
		<p class="mt-4 text-base leading-relaxed">
			Built for candidates and incumbents heading into 2027, and for the campaign managers who run
			their races. Features marked "coming soon" ship in order of demand, so ask for what you need.
		</p>
	</div>

	<!-- Feature groups -->
	<div class="mt-12 space-y-12">
		{#each groups as group (group.name)}
			<div>
				<h2 class="text-xl font-bold text-heading">{group.name}</h2>
				<p class="mt-1 text-sm text-muted">{group.blurb}</p>

				<div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each group.features as feature (feature.name)}
						<div class="flex flex-col rounded-2xl border border-border bg-surface p-5">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<h3 class="font-semibold text-heading">{feature.name}</h3>
								{#if !feature.live}
									<span
										class="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted"
									>
										Coming soon
									</span>
								{/if}
							</div>
							<p class="mt-2 flex-1 text-sm leading-relaxed">{feature.description}</p>
							<p class="mt-4">
								<span
									class="rounded-full px-2.5 py-0.5 text-xs font-semibold {tierClass[feature.tier]}"
								>
									{feature.tier === 'Public' ? 'Free for citizens' : `${feature.tier} and up`}
								</span>
							</p>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<!-- CTA -->
	<div
		class="mt-16 flex flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-10 text-center text-on-primary"
	>
		<h2 class="text-2xl font-bold text-on-primary">Start with a verified profile</h2>
		<p class="max-w-xl text-on-primary/80">
			Every feature above builds on the same foundation: your verified public page. Claim it now
			and grow into the rest.
		</p>
		<div class="mt-2 flex flex-wrap justify-center gap-3">
			<a
				href="/signup"
				class="rounded-full bg-surface px-6 py-3 font-semibold text-heading transition hover:bg-surface-2"
			>
				Claim your profile
			</a>
			<a
				href="/pricing"
				class="rounded-full border border-on-primary/40 px-6 py-3 font-semibold text-on-primary transition hover:bg-on-primary/10"
			>
				View pricing
			</a>
		</div>
	</div>
</section>
