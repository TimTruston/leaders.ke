<script lang="ts">
	import Countdown from '$lib/components/Countdown.svelte';
	import SloganCycler from '$lib/components/SloganCycler.svelte';

	// Placeholder data until the DB is seeded (positions/leaders/posts).
	const promotedLeaders = [
		{ name: 'Edwin Sifuna', position: 'Senator, Nairobi', party: 'ODM', initials: 'ES' },
		{ name: 'John Njagi', position: 'MCA, Muranga', party: 'UDA', initials: 'JN' },
		{ name: 'Faith Wanjiru', position: 'Woman Rep, Kiambu', party: 'Jubilee', initials: 'FW' },
		{ name: 'David Ochieng', position: 'MP, Kisumu West', party: 'MDG', initials: 'DO' }
	];

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
	<title>leaders.ke — The digital Town Hall of Kenya</title>
	<meta
		name="description"
		content="Neutral civic information directory. Verify who is vying, follow campaigns, and engage leaders ahead of the 2027 Kenya General Elections."
	/>
</svelte:head>

<!-- Hero -->
<section class="relative overflow-hidden">
	<div
		class="pointer-events-none absolute inset-0 bg-linear-to-b from-primary-soft/40 to-transparent"
	></div>
	<div class="relative mx-auto grid max-w-7xl gap-5 px-2 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
		<div class="flex flex-col justify-center">
			<span
				class="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-on-primary"
			>
				<span class="size-2 rounded-full bg-primary"></span>
				The platform that verifies who is vying
			</span>
			<h1 class="text-4xl font-extrabold tracking-tight text-heading sm:text-5xl">
				Onboard the next generation of Kenyan leaders
			</h1>
			<div class="mt-4">
				<SloganCycler />
			</div>
			<p class="mt-4 max-w-lg text-base leading-relaxed">
				Discover every elective position, follow verified campaigns, and engage leaders directly on
				web, SMS and WhatsApp ahead of the 2027 General Elections.
			</p>
			<div class="mt-8 flex flex-wrap gap-3">
				<a
					href="/signup"
					class="rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition hover:brightness-95 focus:ring-2 focus:ring-ring focus:outline-none"
				>
					Claim your profile
				</a>
				<a
					href="/leaders"
					class="rounded-full border border-border bg-surface px-6 py-3 font-semibold text-heading transition hover:bg-surface-2"
				>
					Explore leaders
				</a>
			</div>
		</div>

		<!-- Countdown card -->
		<div class="flex items-center justify-center">
			<div
				class="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-sm text-center"
			>
				<p class="text-sm font-medium tracking-wide text-muted uppercase">
					Countdown to the vote
				</p>
				<div class="my-6 mx-auto">
					<Countdown />
				</div>

				<p class="mt-2 text-xl font-semibold text-heading uppercase tracking-widest">
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

<!-- Promoted leaders -->
<section class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
	<div class="mb-8 flex items-end justify-between">
		<div>
			<h2 class="text-2xl font-bold text-heading">Promoted leaders</h2>
			<p class="mt-1 text-sm text-muted">Verified profiles featured on leaders.ke</p>
		</div>
		<a href="/leaders" class="text-sm font-semibold text-primary hover:underline">View all →</a>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each promotedLeaders as leader (leader.name)}
			<a
				href="/leaders"
				class="group rounded-2xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
			>
				<div class="flex items-center gap-3">
					<span
						class="grid size-12 place-items-center rounded-full bg-primary-soft text-lg font-bold text-on-primary"
					>
						{leader.initials}
					</span>
					<div>
						<p class="font-semibold text-heading group-hover:text-primary">{leader.name}</p>
						<p class="text-xs text-muted">{leader.party}</p>
					</div>
				</div>
				<p class="mt-4 text-sm">{leader.position}</p>
			</a>
		{/each}
	</div>
</section>

<!-- Promoted news -->
<section class="border-t border-border bg-surface-2">
	<div class="mx-auto max-w-7xl px-4 py-14 sm:px-6">
		<div class="mb-8 flex items-end justify-between">
			<div>
				<h2 class="text-2xl font-bold text-heading">Latest civic news</h2>
				<p class="mt-1 text-sm text-muted">Aggregated daily from verified media, tagged to leaders</p>
			</div>
			<a href="/news" class="text-sm font-semibold text-primary hover:underline">View all →</a>
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
	</div>
</section>

<!-- CTA -->
<section class="mx-auto max-w-7xl px-4 py-16 sm:px-6">
	<div
		class="flex flex-col items-center gap-4 rounded-3xl bg-primary px-6 py-12 text-center text-on-primary"
	>
		<h2 class="text-2xl font-bold text-on-primary sm:text-3xl">Ready to run in 2027?</h2>
		<p class="max-w-xl text-on-primary/80">
			Create or claim your leader profile, publish your manifesto, and start converting citizens into
			voters today.
		</p>
		<a
			href="/signup"
			class="mt-2 rounded-full bg-surface px-6 py-3 font-semibold text-heading transition hover:bg-surface-2"
		>
			Get started free
		</a>
	</div>
</section>
