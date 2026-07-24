<script lang="ts">
	import { env } from '$env/dynamic/public';

	const voteBase = env.PUBLIC_VOTE_BASE_URL ?? 'https://vote.ke';
</script>

<svelte:head>
	<title>About Us — leaders.ke</title>
	<meta name="description" content="What leaders.ke is, who builds it, and why." />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12 sm:px-6">
	<h1 class="text-3xl font-bold text-heading">About leaders.ke</h1>
	<p class="mt-3 text-lg text-muted">Campaign platform for Smart Kenya's leaders.</p>

	<div class="mt-8 space-y-6 text-sm leading-relaxed text-heading">
		<p>
			leaders.ke equips Kenya's leaders and the teams behind them — candidates, current
			officeholders, campaign managers, and ambassadors — with one platform to run a modern
			campaign: every elective seat, every county, one place.
		</p>
		<section>
			<h2 class="text-lg font-semibold text-heading">What we do</h2>
			<p class="mt-2 text-muted">
				Every leader gets a verified public page: their record, manifesto, contacts, and delivery
				tracker. On top of it sits the campaign toolkit — followers and ward-targeted broadcasts,
				reviews and vote pledges, fundraising, a press desk, and agentic AI that answers
				constituents from the campaign's own material. One flat rate per package, whatever office
				you seek.
			</p>
		</section>
		<section>
			<h2 class="text-lg font-semibold text-heading">Two platforms, one mission</h2>
			<p class="mt-2 text-muted">
				leaders.ke serves the leaders. Its sister platform,
				<a href={voteBase} class="font-medium text-primary hover:underline">vote.ke</a>, serves
				citizens: non-partisan voter education, registration drives, key dates, and the 2027
				ballot simulator. Verified leader data flows between them, so campaigns meet voters where
				voters actually are.
			</p>
		</section>
		<section>
			<h2 class="text-lg font-semibold text-heading">Where we stand</h2>
			<p class="mt-2 text-muted">
				With every leader equally. leaders.ke is party-neutral by design: verification is against
				IEBC records, the same tools at the same price are available to every campaign, and
				citizens' political choices are never shared — in line with the Data Protection Act (2019).
			</p>
		</section>
		<section>
			<h2 class="text-lg font-semibold text-heading">Talk to us</h2>
			<p class="mt-2 text-muted">
				Questions, corrections, or partnerships — reach us through the
				<a href="/contact-us" class="font-medium text-primary hover:underline">Contact Us page</a>.
			</p>
		</section>
	</div>
</div>
