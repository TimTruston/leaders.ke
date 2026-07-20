<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import DeliveryScore from '$lib/components/DeliveryScore.svelte';
	import ExperienceBlock from '$lib/components/ExperienceBlock.svelte';
	import Reviews from '$lib/components/Reviews.svelte';
	import ContactLinks from '$lib/components/contact/ContactLinks.svelte';
	import { renderRichText } from '$lib/utils/richtext';
	import { seatPath } from '$lib/utils/seat';

	// The public /[leader] page body, shared with two admin preview contexts
	// (a pending application, a pending claim) via `preview` — same look citizens
	// will eventually see, so what an admin approves is what actually ships.
	// In preview mode: Reviews and "Is this you?" are hidden (not relevant pre-approval),
	// and three review-only sections render — Request history + Team & sign-offs in the
	// main column (below Experience), IEBC certificate in the sidebar. "Open campaign"
	// stays live even in preview (relabeled "Preview campaign") — the Campaign
	// component it links to derives its own preview state from the run's verified flag.

	let {
		data,
		form = undefined,
		preview = false,
	}: {
		data: any;
		form?: any;
		preview?: boolean;
	} = $props();

	const leader = $derived(data.leader);

	const fmt = new Intl.NumberFormat('en-KE');
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium' });

	// ContactLinks wants a bare phone number (for the wa.me link) and a plain email
	// address; data.contacts carries them as verifiable channel rows instead.
	const contactPhone = $derived(data.contacts.find((c: { channel: string }) => c.channel === 'sms' || c.channel === 'whatsapp')?.value ?? null);
	const contactEmail = $derived(data.contacts.find((c: { channel: string }) => c.channel === 'email')?.value ?? null);

	const isImage = (url: string) => /\.(png|jpe?g|webp|gif|avif)$/i.test(url.split('?')[0]);
</script>

{#snippet upload(label: string, url: string | null)}
	<div>
		<p class="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
		{#if url && isImage(url)}
			<a href={url} target="_blank" rel="noopener" class="mt-1.5 block w-fit">
				<img src={url} alt={label} class="max-h-40 rounded-xl border border-border" />
			</a>
		{:else if url}
			<a href={url} target="_blank" rel="noopener" class="mt-0.5 block text-sm text-primary hover:underline">View uploaded file</a>
		{:else}
			<p class="mt-0.5 text-sm font-medium text-red-500">Missing</p>
		{/if}
	</div>
{/snippet}

<section class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
	{#if !leader.verified}
		<!-- Only admins ever see an unverified profile here (the load function 404s
		everyone else): reviewing a submission is the whole point. -->
		<div class="mb-6 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-heading">
			Preview: this profile is hidden from the public until it gets verified.
		</div>
	{/if}

	<!-- Breadcrumb: current campaign's seat if vying, else last held seat -->
	<nav class="text-sm text-muted" aria-label="Breadcrumb">
		<a href={data.breadcrumb.positionPath} class="hover:text-heading hover:underline">
			{data.breadcrumb.positionTitle}
		</a>
		{#if data.breadcrumb.regionLabel}
			<span class="mx-1">/</span>
			<a href={data.breadcrumb.seatPath} class="hover:text-heading hover:underline">
				{data.breadcrumb.regionLabel}
			</a>
		{/if}
		<span class="mx-1">/</span>
		<span>{leader.name}</span>
	</nav>

	<div class="mt-6 grid gap-6 lg:grid-cols-3">
		<div class="lg:col-span-2">
			<!-- Identity card -->
			<div class="rounded-3xl border border-border bg-surface p-6 sm:p-8">
				<div class="flex flex-col gap-5 sm:flex-row sm:items-center">
					<Avatar name={leader.name} initials={leader.initials} photoUrl={leader.photoUrl} sizeClass="size-30" textClass="text-4xl" />
					<div class="min-w-0">
						<h1 class="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-heading sm:text-3xl">
							{leader.name}
							<!-- Unverified profiles reach here only as admin previews, so the
							badge is gated instead of assumed. -->
							{#if leader.verified}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-on-primary"
								>
									<svg viewBox="0 0 24 24" fill="currentColor" class="size-4 text-primary">
										<path
											fill-rule="evenodd"
											d="M8.6 3.8a4.5 4.5 0 0 0-1.4 1 4.5 4.5 0 0 0-3.8 3.7 4.5 4.5 0 0 0 0 5 4.5 4.5 0 0 0 3.7 3.8 4.5 4.5 0 0 0 5 0 4.5 4.5 0 0 0 3.8-3.7 4.5 4.5 0 0 0 0-5 4.5 4.5 0 0 0-3.7-3.8 4.5 4.5 0 0 0-3.6-1Zm7 6.7a.75.75 0 1 0-1.2-.9l-3.2 4.3-1.7-1.7a.75.75 0 1 0-1 1l2.3 2.4a.75.75 0 0 0 1.1-.1l3.7-5Z"
											clip-rule="evenodd"
										/>
									</svg>
									Verified
								</span>
							{/if}
						</h1>
						<p class="mt-1 text-sm text-muted">
							<span class="capitalize">{leader.status}</span>
							·
							{#if seatPath(leader.positionTitle, leader.regionLabel)}
								<a href={seatPath(leader.positionTitle, leader.regionLabel)} class="hover:text-primary">
									{leader.positionTitle}, {leader.regionLabel}
								</a>
							{:else}
								{leader.positionTitle}, {leader.regionLabel}
							{/if}
							{#if leader.party}· {leader.party}{/if}
						</p>
						<p class="mt-2 text-sm font-medium text-heading">
							{fmt.format(leader.followers)} followers
						</p>
					</div>
				</div>

				{#if leader.bio}
					<!-- Bio is stored as markdown-lite (RichTextEditor); renderRichText
					escapes it before formatting, so {@html} is safe here. -->
					<div class="mt-6 space-y-2 leading-normal text-lg">{@html renderRichText(leader.bio)}</div>
				{/if}
			</div>

			<!-- Delivery score: public rollup of the manifesto tracker -->
			{#if data.delivery.total > 0}
				<div class="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
					<DeliveryScore delivered={data.delivery.delivered} total={data.delivery.total} inProgress={data.delivery.inProgress} />
				</div>
			{/if}

			<!-- Education + professional experience -->
			{#if data.experience.education.length > 0 || data.experience.professional.length > 0}
				<div class="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
					<h2 class="text-xl font-bold text-heading">Experience</h2>
					{#if data.experience.professional.length > 0}
						<h3 class="mt-5 text-xs font-semibold tracking-wide text-muted uppercase">Professional</h3>
						<ul class="mt-4 space-y-3">
							{#each data.experience.professional as item, i (i)}
								<ExperienceBlock
									title={item.title}
									subtitle={item.institution}
									href={item.href}
									description={item.description}
									dateLabel={item.badge === 'aspirant'
										? `Vying · from ${item.from}`
										: item.from
											? `${item.from}${item.to ? `–${item.to}` : ' – present'}`
											: ''}
									badge={item.badge}
									badgeClass={item.badge === 'current' ? 'bg-primary-soft text-on-primary' : 'bg-surface text-muted'}
								/>
							{/each}
						</ul>
					{/if}
					{#if data.experience.education.length > 0}
						<h3 class="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Education</h3>
						<ul class="mt-3 space-y-3">
							{#each data.experience.education as item, i (i)}
								<ExperienceBlock
									title={item.title}
									subtitle={item.institution}
									description={item.description}
									dateLabel={item.from ? `${item.from}${item.to ? `–${item.to}` : ''}` : ''}
								/>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			{#if !preview}
				<!-- In the news: aggregated coverage tagged to this leader -->
				{#if data.news.length > 0}
					<div class="mt-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
						<h2 class="text-xl font-bold text-heading">In the news</h2>
						<p class="mt-1 text-sm text-muted">Coverage from verified media, tagged automatically.</p>
						<div class="mt-5 space-y-4">
							{#each data.news as item (item.id)}
								<article class="border-b border-border pb-4 last:border-b-0 last:pb-0">
									<div class="flex flex-wrap items-baseline justify-between gap-2">
										<h3 class="text-sm font-semibold text-heading">{item.title}</h3>
										<span class="text-xs text-muted">{dateFmt.format(new Date(item.createdAt))}</span>
									</div>
									<p class="mt-1 text-sm leading-relaxed text-muted">{item.summary}</p>
								</article>
							{/each}
						</div>
					</div>
				{/if}
				<!-- Citizen reviews -->
				<Reviews
					leaderName={leader.name}
					positionTitle={leader.positionTitle}
					reviews={data.reviews}
					pillarOptions={data.reviewPillarOptions}
					signedIn={data.signedIn}
					flaggedReviewCounts={data.flaggedReviewCounts}
					myReview={data.myReview}
					{form}
				/>
			{/if}
		</div>

		<!-- Sidebar: active campaign + seat links -->
		<div class="space-y-6">
			{#if data.campaign}
				<div class="rounded-3xl border border-primary bg-surface p-6">
					<p class="text-xs font-semibold tracking-wide text-primary uppercase">
						🚀 Active {data.campaign.year} campaign
					</p>
					<p class="mt-2 text-sm leading-relaxed">
						{data.campaign.pillarCount} manifesto pillar{data.campaign.pillarCount === 1 ? '' : 's'}
						{#if data.campaign.latestPost}
							· latest update: "{data.campaign.latestPost.title}" ({dateFmt.format(new Date(data.campaign.latestPost.createdAt))})
						{/if}
					</p>
					<a
						href={data.campaign.path}
						class="mt-4 inline-block w-full rounded-full bg-primary px-5 py-2.5 text-center font-semibold text-on-primary transition hover:brightness-95"
					>
						{preview ? 'Preview campaign' : 'Open campaign'}
					</a>
					<p class="mt-2 text-center text-xs text-muted">
						{preview ? 'Admin/owner preview — not public yet.' : 'Manifesto, updates and follow live there.'}
					</p>
				</div>
			{/if}

			{#if data.contacts.length > 0 || leader.address || Object.keys(leader.socials).length > 0}
				<div class="rounded-3xl border border-border bg-surface-2 p-6">
					<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">Contact</h2>
					<div class="mt-4">
						<ContactLinks phone={contactPhone} email={contactEmail} socials={leader.socials} share={!preview} shareTitle={leader.name} />
					</div>
					{#if leader.address}
						<p class="mt-3 space-y-2 text-sm">
							{leader.address}
						</p>
					{/if}
				</div>
			{/if}

			<div class="rounded-3xl border border-border bg-surface-2 p-6">
				<h2 class="text-sm font-semibold tracking-wide text-muted uppercase">This seat</h2>
				<ul class="mt-3 space-y-2 text-sm">
					<li>
						<a href={data.breadcrumb.seatPath} class="font-medium text-heading hover:text-primary">
							{data.breadcrumb.positionTitle}{#if data.breadcrumb.regionLabel}, {data.breadcrumb.regionLabel}{/if} hub →
						</a>
					</li>
					<li>
						<a href="{data.breadcrumb.seatCyclePath}/2027" class="font-medium text-heading hover:text-primary">
							🗳️ 2027 contestants →
						</a>
					</li>
				</ul>
			</div>

			{#if !preview && data.canClaim}
				<div class="rounded-3xl bg-primary p-6 text-on-primary">
					<h2 class="text-lg font-bold text-on-primary">Is this you?</h2>
					<p class="mt-2 text-sm text-on-primary/80">
						Claim this profile and get manager access to run its campaign toolkit.
					</p>
					<a
						href="/dashboard/claim/{leader.slug}/profile"
						class="mt-4 inline-block rounded-full bg-surface px-5 py-2.5 text-sm font-semibold text-heading transition hover:bg-surface-2"
					>
						Claim this profile
					</a>
				</div>
			{/if}
		</div>
	</div>
</section>
