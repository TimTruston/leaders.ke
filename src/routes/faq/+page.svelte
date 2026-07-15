<script lang="ts">
	// FAQ: grounded in shipped features and the visible pipeline (Features page /
	// docs/TODO.md); pipeline answers say "coming" so nothing reads as live before
	// it is. Search filters question + answer text client-side.
	type Faq = { q: string; a: string };
	type Section = { title: string; items: Faq[] };

	const sections: Section[] = [
		{
			title: 'Citizens',
			items: [
				{
					q: 'What can I do here without an account?',
					a: 'Browse every leader and 2027 candidate, view seat pages for any position and region, compare two leaders side by side, check the Ranks table, and read manifestos with their delivery trackers.'
				},
				{
					q: 'How do I follow a leader or campaign?',
					a: 'Open their public page and follow with just your name and a phone or email. The channel you provide becomes how their campaign updates reach you, and every message carries an opt-out.'
				},
				{
					q: 'What is the ballot simulator?',
					a: 'Vote 2027 lets you simulate your full six-seat ballot (President, Governor, Senator, Woman Rep, MP, MCA) and share a result page that carries no personal information.'
				},
				{
					q: 'Can I review a leader?',
					a: "Yes — rate and review any leader on their public page, organized around their manifesto pillars. Campaigns can respond in the review's thread and flag abuse; platform admins arbitrate flags."
				},
				{
					q: 'Will anyone see my political choices?',
					a: 'No. Ballots, follows, and reviews are never sold or shared in a form that identifies you, per the Data Protection Act (2019). See the Privacy and Data Policy pages.'
				}
			]
		},
		{
			title: 'Leaders & candidates',
			items: [
				{
					q: 'How do I get on leaders.ke?',
					a: 'If a profile for you already exists, claim it via "Claim this profile" on that page. Otherwise create one: hit Create a Profile, fill the Profile, Contacts, Documentation, Team, and Signoff tabs, and submit for verification.'
				},
				{
					q: 'What does verification involve?',
					a: 'You upload your ID, photo, and IEBC Certificate of Clearance, name your role and national ID in the Signoff tab, and an admin reviews the application. Rejections come back with the reason so you know what to fix.'
				},
				{
					q: 'What do I get once verified?',
					a: 'A permanent public page at leaders.ke/your-name: bio, record, manifesto with a public delivery tracker, posts, reviews, followers, fundraising, and a PR desk that tracks your news mentions.'
				},
				{
					q: 'How do broadcasts work?',
					a: 'Compose once and send to your followers filtered by ward or county. Email works today; SMS and WhatsApp broadcasts arrive with the credits system.'
				},
				{
					q: 'Can an AI answer my constituents?',
					a: 'Yes — campaign pages carry a chat grounded in your manifesto, answering constituent questions 24/7. Persistent conversations and WhatsApp as a channel are in the pipeline.'
				},
				{
					q: 'Can I raise funds through my page?',
					a: 'Your campaign page takes donations against a public goal today (manually confirmed ledger). Direct M-Pesa STK push and automated receipts are in the pipeline.'
				}
			]
		},
		{
			title: 'Managers & teams',
			items: [
				{
					q: 'Can I run a campaign without the candidate?',
					a: "Yes. Managers can create the campaign, complete the application, and run the whole dashboard — the candidate never has to touch it. You'll appear with a \"Managing\" badge."
				},
				{
					q: 'How do I build a team?',
					a: 'Invite managers and ambassadors by email from the Team tab. An application needs at least 2 team members before it can be submitted. Only admin managers can add or remove other managers.'
				},
				{
					q: 'What do ambassadors do?',
					a: 'Ambassadors mobilize on the ground: each campaign they serve appears as a tab on their citizen dashboard where they add citizens as followers (with consent) and see the roster they recruited.'
				},
				{
					q: 'What happens if a manager or ambassador leaves?',
					a: 'Their recruits stay attached to the campaign — removing a manager keeps their ambassadors, and removing an ambassador keeps the followers they signed up.'
				}
			]
		},
		{
			title: 'Billing & pricing',
			items: [
				{
					q: 'What does it cost?',
					a: 'Citizens pay nothing. Campaigns subscribe monthly on one of three tiers (Aspirant, Influencer, Mobilizer) scaled to the office — see the Pricing page for the matrix.'
				},
				{
					q: 'When do I pay?',
					a: 'After approval: you complete verification first, then pay for the package that takes your page public. Online checkout (Paystack/M-Pesa) is in the pipeline; payments are handled manually until then.'
				},
				{
					q: 'Are there fundraising fees?',
					a: 'The platform takes a small percentage per tier on donations, disclosed at the point of donation; the fee is charged once and cut on refunds.'
				},
				{
					q: 'Can I be featured on the homepage?',
					a: 'Featured placement (your profile pinned for every visitor) is in the pipeline — the rail exists, the purchase flow is coming.'
				}
			]
		},
		{
			title: 'Legal & data',
			items: [
				{
					q: 'Is leaders.ke neutral?',
					a: 'Yes — every campaign gets the same tools on the same terms, verification is against IEBC records, and the platform endorses no one.'
				},
				{
					q: 'What laws does the platform follow?',
					a: 'The Kenya Data Protection Act (2019) for personal data and IEBC regulations for campaign material. Political opinions are treated as sensitive data.'
				},
				{
					q: 'How do I correct or delete my data?',
					a: 'Manage everything from your account page, including full account deletion, or write to privacy@leaders.ke for anything the dashboard doesn\'t cover.'
				},
				{
					q: 'How is spam and impersonation handled?',
					a: 'Impersonating a leader gets the account removed; profiles only go public after ID and IEBC verification. OTP verification guards contacts, and follower messages always carry an opt-out.'
				}
			]
		}
	];

	let query = $state('');
	const visible = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return sections;
		return sections
			.map((s) => ({
				...s,
				items: s.items.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))
			}))
			.filter((s) => s.items.length > 0);
	});
</script>

<svelte:head>
	<title>FAQ — leaders.ke</title>
	<meta name="description" content="Frequently asked questions about leaders.ke, for citizens, leaders, campaign teams, billing, and data." />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-12 sm:px-6">
	<h1 class="text-3xl font-bold text-heading">Frequently asked questions</h1>
	<p class="mt-3 text-lg text-muted">
		Everything about the platform, in one place. Can't find it? <a href="/contact-us" class="font-medium text-primary hover:underline">Contact us</a>.
	</p>

	<input
		type="search"
		bind:value={query}
		placeholder="Search the FAQ…"
		aria-label="Search the FAQ"
		class="mt-6 w-full rounded-full border border-border bg-surface px-5 py-3 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
	/>

	{#each visible as section (section.title)}
		<section class="mt-8" aria-label={section.title}>
			<h2 class="text-lg font-semibold text-heading">{section.title}</h2>
			<div class="mt-3 space-y-2">
				{#each section.items as faq (faq.q)}
					<details class="group rounded-2xl border border-border bg-surface p-4" open={!!query.trim()}>
						<summary class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-heading">
							{faq.q}
							<span class="text-muted transition group-open:rotate-180">⌄</span>
						</summary>
						<p class="mt-2 text-sm leading-relaxed text-muted">{faq.a}</p>
					</details>
				{/each}
			</div>
		</section>
	{:else}
		<p class="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
			Nothing matches "{query}" — try another word, or <a href="/contact-us" class="font-medium text-primary hover:underline">ask us directly</a>.
		</p>
	{/each}
</div>
