<script lang="ts">
	import Countdown from '$lib/components/Countdown.svelte';
	import SloganCycler from '$lib/components/SloganCycler.svelte';

	// The homepage sells to the paying customer (candidates and currents);
	// citizens get the directory, news and countdown as the public layer.

	// Campaign toolkit grid: what a subscription buys. `live` distinguishes
	// shipped features from roadmap items (badged "Coming soon") — the badge
	// doubles as a demand test for later phases.
	const toolkit = [
		{
			title: 'Verified profile',
			description:
				'A verified public page with your manifesto, photo and party at a clean URL citizens can trust.',
			live: true,
			icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
		},
		{
			title: 'Featured placement',
			description:
				'Put your profile in front of every visitor on the leaders.ke homepage and directory.',
			live: true,
			icon: 'M11.48 3.5a.562.562 0 0 1 1.04 0l2.12 5.11 5.52.44c.5.04.7.66.32.99l-4.2 3.6 1.28 5.38a.562.562 0 0 1-.84.61L12 16.72l-4.72 2.91a.562.562 0 0 1-.84-.61l1.28-5.38-4.2-3.6a.562.562 0 0 1 .32-.99l5.52-.44 2.12-5.11Z'
		},
		{
			title: 'Followers & broadcasts',
			description:
				'Grow a follower base from your page, then reach them by ward via email, SMS and WhatsApp.',
			live: false,
			icon: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z'
		},
		{
			title: 'Reviews & fundraising',
			description:
				'Citizens review your leadership and pledge their votes, while you collect campaign donations via M-Pesa.',
			live: false,
			icon: 'M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
		},
		{
			title: 'PR desk',
			description:
				'Every news mention tagged to you, AI-drafted responses, and crisis alerts when coverage turns.',
			live: false,
			icon: 'M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5'
		},
		{
			title: 'AI chat & competitor watch',
			description:
				'An AI that answers constituent questions from your manifesto, plus a live view of your rivals.',
			live: false,
			icon: 'M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z'
		}
	];

	// Claim → verify → pay → go public: the onboarding funnel in four steps.
	const steps = [
		{
			title: 'Claim your profile',
			description: 'Sign up and create or claim your leader profile for the seat you are vying for.'
		},
		{
			title: 'Get verified',
			description: 'Submit your ID and proof of candidature; our team verifies against IEBC records.'
		},
		{
			title: 'Pick a package',
			description: 'Pay for the package that fits your race, from MCA to President, via M-Pesa.'
		},
		{
			title: 'Go public',
			description: 'Your verified page goes live and starts converting visitors into followers.'
		}
	];

	// Placeholder quotes until Phase 4 delivers real case studies.
	const testimonials = [
		{
			quote:
				'My constituents finally have one place to read my manifesto instead of screenshots on WhatsApp.',
			name: 'Verified aspirant',
			role: 'MCA candidate, Rift Valley'
		},
		{
			quote:
				'The verification badge settled the fake-accounts problem in one week. We point everyone to the page.',
			name: 'Campaign manager',
			role: 'Gubernatorial campaign, Coast'
		},
		{
			quote: 'We treat the profile link like our digital office. It goes on every poster we print.',
			name: 'Communications lead',
			role: 'Senatorial campaign, Nairobi'
		}
	];

	// Placeholder news until the aggregation pipeline (Phase 5) lands.
	const promotedNews = [
		{
			tag: 'Finance Bill',
			title: 'Aspirants weigh in on the 2027 fiscal framework',
			summary: 'Twelve verified candidates published positions on the proposed tax changes this week.',
			time: '2h ago'
		},
		{
			tag: 'Youth & Jobs',
			title: 'Gen Z voter registration drive crosses 500k',
			summary: 'Campaign ambassadors mobilized first-time voters across 23 counties.',
			time: '5h ago'
		},
		{
			tag: 'Devolution',
			title: 'County manifestos compared side by side',
			summary: 'leaders.ke digest breaks down health and water pledges by region.',
			time: '1d ago'
		}
	];

	const stats = [
		{ value: '1,450+', label: 'Elective positions' },
		{ value: '8,900+', label: 'Leader profiles' },
		{ value: '47', label: 'Counties covered' }
	];

</script>

<svelte:head>
	<title>leaders.ke — Your 2027 campaign HQ</title>
	<meta
		name="description"
		content="Run and win your 2027 campaign from one platform: a verified profile, manifesto, followers and broadcasts. Citizens: verify who is vying and follow campaigns."
	/>
</svelte:head>

<!-- Hero: speaks to the candidate; the countdown card keeps election urgency front and center -->
<section class="relative overflow-hidden">
	<div
		class="pointer-events-none absolute inset-0 bg-linear-to-b from-primary-soft/40 to-transparent"
	></div>
	<div class="relative mx-auto grid max-w-7xl gap-5 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
		<div class="flex flex-col justify-center">
			<span
				class="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-on-primary"
			>
				<span class="size-2 rounded-full bg-primary"></span>
				The platform that verifies who is vying
			</span>
			<h1 class="text-4xl font-extrabold tracking-tight text-heading sm:text-5xl">
				Your 2027 campaign HQ
			</h1>
			<div class="mt-4">
				<SloganCycler />
			</div>
			<p class="mt-4 max-w-lg text-base leading-relaxed">
				A verified profile, your manifesto, your followers and your PR, all in one place. Built for
				candidates and currents; open to every citizen ahead of the 2027 General Elections.
			</p>
			<div class="mt-8 flex flex-wrap gap-3">
				<a
					href="/signup"
					class="rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition hover:brightness-95 focus:ring-0 focus:ring-ring focus:outline-none"
				>
					Claim your profile
				</a>
				<a
					href="/leaders"
					class="rounded-full border border-border bg-surface px-6 py-3 font-semibold text-heading transition hover:bg-surface-2"
				>
					Explore leaders
				</a>
				<a
					href="/vote/2027"
					class="rounded-full border border-border bg-surface px-6 py-3 font-semibold text-heading transition hover:bg-surface-2"
				>
					Simulate my 2027 ballot
				</a>
			</div>
		</div>

		<!-- Countdown card -->
		<div class="flex items-center justify-center">
			<div
				class="my-6 w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-sm"
			>
				<p class="text-sm font-medium tracking-wide text-muted uppercase">Countdown to the vote</p>
				<div class="mx-auto my-6">
					<Countdown />
				</div>

				<p class="mt-2 text-xl font-semibold tracking-widest text-heading uppercase">
					10 August 2027
				</p>

				<div class="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-6">
					{#each stats as stat (stat.label)}
						<div>
							<p class="text-xl font-bold text-primary">{stat.value}</p>
							<p class="text-xs text-muted">{stat.label}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Campaign toolkit: the feature grid a subscription buys -->
<section class="border-t border-border bg-surface-2">
	<div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
		<div class="mb-8 ">
			<h2 class="text-2xl font-bold text-heading">Everything a campaign needs</h2>
			<p class="mt-1 text-sm text-muted">
				One subscription runs your entire public presence, whether you are defending a seat or
				gunning for one.
			</p>
		</div>

		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each toolkit as feature (feature.title)}
				<div class="flex flex-col rounded-2xl border border-border bg-surface p-6">
					<div class="flex items-center justify-between">
						<span class="grid size-10 place-items-center rounded-xl bg-primary-soft text-on-primary">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="size-5"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d={feature.icon} />
							</svg>
						</span>
						{#if !feature.live}
							<span
								class="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted"
							>
								Coming soon
							</span>
						{/if}
					</div>
					<h3 class="mt-4 font-semibold text-heading">{feature.title}</h3>
					<p class="mt-2 flex-1 text-sm leading-relaxed">{feature.description}</p>
				</div>
			{/each}
		</div>

		<div class="mt-8 text-center">
			<a href="/features" class="text-sm font-semibold text-primary hover:underline">
				See the full feature list →
			</a>
		</div>
	</div>
</section>

<!-- How it works: the onboarding funnel -->
<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="mb-8 ">
		<h2 class="text-2xl font-bold text-heading">From aspirant to verified in four steps</h2>
		<p class="mt-1 text-sm text-muted">
			Campaign managers can sign up and run the whole process on a candidate's behalf.
		</p>
	</div>

	<ol class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each steps as step, i (step.title)}
			<li class="rounded-2xl border border-border bg-surface p-6">
				<span
					class="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary"
				>
					{i + 1}
				</span>
				<h3 class="mt-4 font-semibold text-heading">{step.title}</h3>
				<p class="mt-2 text-sm leading-relaxed">{step.description}</p>
			</li>
		{/each}
	</ol>
</section>

<!-- Social proof: placeholder quotes until real Phase 4 case studies replace them -->
<section class="border-t border-border bg-surface-2">
	<div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
		<h2 class="text-2xl font-bold text-heading">Campaigns run on leaders.ke</h2>
		<div class="mt-8 grid gap-4 md:grid-cols-3">
			{#each testimonials as t (t.role)}
				<figure class="flex flex-col rounded-2xl border border-border bg-surface p-6">
					<svg viewBox="0 0 24 24" fill="currentColor" class="size-6 text-primary/40">
						<path
							d="M7.2 5.6C4.9 7.1 3.4 9.6 3.4 12.6c0 3.4 2.2 5.8 5 5.8 2.4 0 4.2-1.8 4.2-4.1 0-2.2-1.6-3.9-3.8-3.9-.4 0-.9.1-1 .1.3-1.9 2-4 3.8-5l-4.4.1Zm9.9 0c-2.3 1.5-3.8 4-3.8 7 0 3.4 2.2 5.8 5 5.8 2.3 0 4.2-1.8 4.2-4.1 0-2.2-1.7-3.9-3.9-3.9-.4 0-.8.1-1 .1.4-1.9 2.1-4 3.9-5l-4.4.1Z"
						/>
					</svg>
					<blockquote class="mt-3 flex-1 text-sm leading-relaxed">{t.quote}</blockquote>
					<figcaption class="mt-4">
						<p class="text-sm font-semibold text-heading">{t.name}</p>
						<p class="text-xs text-muted">{t.role}</p>
					</figcaption>
				</figure>
			{/each}
		</div>
	</div>
</section>

<!-- Promoted news: the public civic layer; later fed by the PR desk pipeline -->
<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="mb-8">
		<h2 class="text-2xl font-bold text-heading">Latest civic news</h2>
		<p class="mt-1 text-sm text-muted">Aggregated daily from verified media, tagged to leaders</p>
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		{#each promotedNews as item (item.title)}
			<article class="flex flex-col rounded-2xl border border-border bg-surface p-6">
				<span
					class="w-fit rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-on-primary"
				>
					{item.tag}
				</span>
				<h3 class="mt-3 font-semibold text-heading">{item.title}</h3>
				<p class="mt-2 flex-1 text-sm leading-relaxed">{item.summary}</p>
				<p class="mt-4 text-xs text-muted">{item.time}</p>
			</article>
		{/each}
	</div>
</section>

<!-- Pricing teaser + CTA -->
<section class="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
	<div
		class="flex flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-12 text-center text-on-primary"
	>
		<h2 class="text-2xl font-bold text-on-primary sm:text-3xl">Ready to run in 2027?</h2>
		<p class="max-w-xl text-on-primary/80">
			Packages from KES 1,000/month, priced by the office you are vying for. Claim your profile,
			get verified, and go public before your opponents do.
		</p>
		<div class="mt-2 flex flex-wrap justify-center gap-3">
			<a
				href="/signup"
				class="rounded-full bg-surface px-6 py-3 font-semibold text-heading transition hover:bg-surface-2"
			>
				Get started free
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
