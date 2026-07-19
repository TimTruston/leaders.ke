<script lang="ts">
	import { enhance } from '$app/forms';
	import { renderRichText } from '$lib/utils/richtext';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const d = $derived(data.detail);
	const dateFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

	// Uploaded files are mostly images; the IEBC certificate is a PDF, so only
	// image extensions get a thumbnail and everything else gets a plain link.
	const isImage = (url: string) => /\.(png|jpe?g|webp|gif|avif)$/i.test(url.split('?')[0]);

	const cardClass = 'rounded-2xl border border-border bg-surface p-5';
	const labelClass = 'text-xs font-semibold tracking-wide text-muted uppercase';
</script>

<svelte:head>
	<title>Verification #{d.request.id} — Admin</title>
</svelte:head>

{#snippet field(label: string, value: string | null)}
	<div>
		<p class={labelClass}>{label}</p>
		{#if value}
			<p class="mt-0.5 text-sm text-heading">{value}</p>
		{:else}
			<p class="mt-0.5 text-sm font-medium text-red-500">Missing</p>
		{/if}
	</div>
{/snippet}

{#snippet upload(label: string, url: string | null)}
	<div>
		<p class={labelClass}>{label}</p>
		{#if url && isImage(url)}
			<a href={url} target="_blank" rel="noopener" class="mt-1.5 block w-fit">
				<img src={url} alt={label} class="max-h-48 rounded-xl border border-border" />
			</a>
		{:else if url}
			<a href={url} target="_blank" rel="noopener" class="mt-0.5 block text-sm text-primary hover:underline">
				View uploaded file
			</a>
		{:else}
			<p class="mt-0.5 text-sm font-medium text-red-500">Missing</p>
		{/if}
	</div>
{/snippet}

<div>
	<a href="/dashboard/admin/verifications" class="text-sm text-muted hover:text-heading">&larr; Verifications</a>

	<div class="mt-2 flex flex-wrap items-center gap-3">
		<h1 class="text-xl font-bold text-heading">{d.profile.name}</h1>
		<span
			class="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {d.request.outcome === 'approved'
				? 'bg-primary-soft text-on-primary'
				: d.request.outcome === 'rejected'
					? 'bg-surface-2 text-muted'
					: 'border border-border text-muted'}"
		>
			{d.request.outcome ?? 'pending'}
		</span>
		Requested at {dateFmt.format(new Date(d.request.requestedAt))}
	</div>
	{#if form?.error}
		<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<!-- Decision controls: same ?/review semantics as the queue, kept next to the evidence. -->
	<div class="mt-4 {cardClass}">
		{#if d.request.outcome === 'rejected' && d.request.notes}
			<p class="mb-3 text-sm text-muted">
				<span class="font-semibold text-heading">Rejection reason:</span>
				{d.request.notes}
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			{#if d.request.outcome !== 'approved'}
				<form method="post" action="?/review" use:enhance>
					<button
						type="submit"
						name="outcome"
						value="approved"
						class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
					>
						Approve
					</button>
				</form>
			{/if}
			{#if d.request.outcome !== 'rejected'}
				<!-- Reject (pending) and Revert (approved) both carry a reason back to the applicant. -->
				<form
					method="post"
					action="?/review"
					class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
					use:enhance={({ cancel }) => {
						if (
							d.request.outcome === 'approved' &&
							!confirm(`Revert ${d.profile.name}'s verification? Their profile goes back off the public pages immediately.`)
						) {
							cancel();
						}
					}}
				>
					<input type="hidden" name="outcome" value="rejected" />
					<input
						type="text"
						name="notes"
						placeholder="Reason for {d.request.outcome === 'approved' ? 'reverting' : 'rejection'} (shown to the applicant)"
						class="min-w-64 flex-1 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
					<button
						type="submit"
						class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
					>
						{d.request.outcome === 'approved' ? 'Revert' : 'Reject'}
					</button>
				</form>
			{/if}
		</div>
	</div>

	<!-- The application, section per applicant tab -->
	<div class="mt-6 grid gap-4 lg:grid-cols-2">
		<div class={cardClass}>
			<h2 class="font-semibold text-heading">Profile</h2>
			<div class="mt-4 grid gap-4 sm:grid-cols-2">
				{@render field('Name', d.profile.name)}
				{@render field('Elective position', d.profile.seat ? `${d.profile.seat.title}, ${d.profile.seat.region}` : null)}
				{@render field('Slug', d.profile.slug)}
				<div>
					<p class={labelClass}>Party</p>
					<p class="mt-0.5 text-sm {d.profile.party ? 'text-heading' : 'text-muted'}">{d.profile.party ?? 'None'}</p>
				</div>
			</div>
			<div class="mt-4">
				<p class={labelClass}>Bio</p>
				{#if d.profile.bio}
					<!-- Bio is stored as markdown-lite (RichTextEditor); renderRichText
					escapes first, so this is safe to inject. -->
					<div class="mt-1 space-y-2 text-sm leading-relaxed text-heading">{@html renderRichText(d.profile.bio)}</div>
				{:else}
					<p class="mt-0.5 text-sm font-medium text-red-500">Missing</p>
				{/if}
			</div>
		</div>

		<div class={cardClass}>
			<h2 class="font-semibold text-heading">Contacts</h2>
			<div class="mt-4 space-y-4">
				{@render field('Office / address', d.profile.address)}
				{#each ['sms', 'email'] as channel (channel)}
					{@const rows = d.contacts.filter((c) => c.channel === channel)}
					<div>
						<p class={labelClass}>{channel === 'sms' ? 'Phone' : 'Email'}</p>
						{#if rows.length > 0}
							{#each rows as c (c.value)}
								<p class="mt-0.5 text-sm text-heading">
									{c.value}
									{#if c.verified}<span class="ml-1 text-xs font-semibold text-primary">verified</span>{/if}
								</p>
							{/each}
						{:else}
							<p class="mt-0.5 text-sm font-medium text-red-500">Missing</p>
						{/if}
					</div>
				{/each}
				{#if Object.keys(d.profile.socials).length > 0}
					<div>
						<p class={labelClass}>Links</p>
						{#each Object.entries(d.profile.socials) as [network, url] (network)}
							<p class="mt-0.5 text-sm text-heading">
								<span class="capitalize">{network}</span>:
								<a href={url} target="_blank" rel="noopener" class="break-all text-primary hover:underline">{url}</a>
							</p>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class={cardClass}>
			<h2 class="font-semibold text-heading">Documentation</h2>
			<div class="mt-4 space-y-4">
				{@render upload("Leader's photo", d.documentation.photoUrl)}
				{@render upload('IEBC Certificate of Clearance', d.documentation.iebcCertificateUrl)}
			</div>
		</div>

		<!-- Team, each with their own sign-off (role, national ID, ID images) -->
		<div class="{cardClass} lg:col-span-2">
			<h2 class="font-semibold text-heading">Team &amp; sign-offs</h2>
			<p class="mt-1 text-sm text-muted">Each manager attests separately: their role, national ID, and ID images.</p>
			{#if d.team.length > 0}
				<div class="mt-4 space-y-4">
					{#each d.team as member (member.name)}
						<div class="rounded-2xl border border-border bg-surface-2/40 p-4">
							<p class="text-sm font-semibold text-heading">
								{member.name}
								{#if member.isApplicant}
									<span class="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">applicant</span>
								{/if}
								{#if member.signoffComplete}
									<span class="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary">signed off</span>
								{:else}
									<span class="ml-1 rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">no sign-off</span>
								{/if}
								<span class="mt-0.5 text-xs text-muted">
									{member.email ?? 'No email'}
								</span>
								<span class="mt-0.5 text-xs text-muted">
									{member.phone ?? (member.email ? '' : 'No phone')}
								</span>
							</p>
							<div class="mt-3 grid gap-4 sm:grid-cols-2">
								{@render field('Role', member.title)}
								{@render field('National ID', member.nationalId)}
								{@render upload('ID front', member.idFrontUrl)}
								{@render upload('ID back', member.idBackUrl)}
							</div>
						</div>
					{/each}
				</div>
			{/if}
			{#if d.team.length < 2}
				<p class="mt-4 text-sm font-medium text-red-500">
					{2 - d.team.length} more team member{d.team.length === 1 ? '' : 's'} needed (2 needed)
				</p>
			{/if}
		</div>
	</div>

	<!-- Every request this leader has made, newest first -->
	<h2 class="mt-8 text-lg font-semibold text-heading">Request history</h2>
	<div class="mt-3 overflow-x-auto rounded-2xl border border-border">
		<table class="w-full min-w-160 border-collapse text-left">
			<thead>
				<tr class="bg-surface-2">
					<th class="px-4 py-3 text-sm font-semibold text-heading">Requested</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Outcome</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Reviewed</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Reviewer</th>
					<th class="px-4 py-3 text-sm font-semibold text-heading">Notes</th>
				</tr>
			</thead>
			<tbody>
				{#each d.history as h (h.id)}
					<tr class="border-t border-border {h.id === d.request.id ? 'bg-surface-2/50' : ''}">
						<td class="px-4 py-3 text-sm text-muted">{dateFmt.format(new Date(h.requestedAt))}</td>
						<td class="px-4 py-3 text-sm capitalize text-heading">{h.outcome ?? 'pending'}</td>
						<td class="px-4 py-3 text-sm text-muted">{h.reviewedAt ? dateFmt.format(new Date(h.reviewedAt)) : '—'}</td>
						<td class="px-4 py-3 text-sm text-muted">{h.reviewerName ?? '—'}</td>
						<td class="px-4 py-3 text-sm text-muted">{h.notes ?? '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
