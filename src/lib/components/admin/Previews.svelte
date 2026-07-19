<script lang="ts">
	import { enhance } from '$app/forms';
	import LeaderProfile from '$lib/components/LeaderProfile.svelte';
	import type { Snippet } from 'svelte';

	// Shared shell for the verification and claim admin preview pages: the same
	// profile-as-it-will-render (LeaderProfile in preview mode) plus the review-only
	// extras (IEBC cert, request history, team sign-offs) and decision controls.
	// Only the request-review wording and the claims-only "email the leader" action
	// differ between the two — everything else renders identically.
	let {
		backHref,
		backLabel,
		reviewNoun,
		data,
		request,
		iebcCertificateUrl,
		team,
		requestHistory,
		historyLabel,
		form = undefined,
		actionsExtra,
		belowActions
	}: {
		backHref: string;
		backLabel: string;
		reviewNoun: string; // 'applicant' | 'claimant' — used in the reject/revert copy
		data: any;
		request: {
			id: number;
			outcome: 'approved' | 'rejected' | null;
			notes: string | null;
			requestedAt: string;
			requestedByName: string | null;
		};
		iebcCertificateUrl: string | null;
		team: {
			name: string;
			title: string | null;
			nationalId: string | null;
			idFrontUrl: string | null;
			idBackUrl: string | null;
			signoffComplete: boolean;
			isApplicant: boolean;
			phone: string | null;
			email: string | null;
		}[];
		requestHistory: {
			id: number;
			requestedAt: string;
			outcome: 'approved' | 'rejected' | null;
			notes: string | null;
			reviewedAt: string | null;
			reviewerName: string | null;
		}[];
		historyLabel: string;
		form?: any;
		actionsExtra?: Snippet;
		belowActions?: Snippet;
	} = $props();

	const dateTimeFmt = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
</script>

{#snippet idThumb(label: string, url: string | null)}
	<div>
		<p class="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
		{#if url}
			<a href={url} target="_blank" rel="noopener" class="mt-1.5 block overflow-hidden rounded-xl border border-border">
				<img src={url} alt={label} class="aspect-3/2 w-full object-cover" />
			</a>
		{:else}
			<div class="mt-1.5 flex aspect-3/2 w-full items-center justify-center rounded-xl border border-dashed border-border">
				<p class="text-xs font-medium text-red-500">Missing</p>
			</div>
		{/if}
	</div>
{/snippet}

<div class="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
	<a href={backHref} class="text-sm text-muted hover:text-heading">&larr; {backLabel}</a>

	<div class="mt-2 flex flex-wrap items-center justify-between">
		<div class="flex flex-wrap items-center gap-3">
			<h1 class="text-xl font-bold text-heading">{data.leader.name}</h1>
			<span
				class="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize {request.outcome === 'approved'
					? 'bg-primary-soft text-on-primary'
					: request.outcome === 'rejected'
						? 'bg-surface-2 text-muted'
						: 'border border-border text-muted'}"
			>
				{request.outcome ?? 'pending'}
			</span>
		</div>
		<span class="text-sm text-muted">
			{#if iebcCertificateUrl}
				<a href={iebcCertificateUrl} target="_blank" rel="noopener" class="text-primary hover:underline">View IEBC Cert</a>
			{:else}
				<span class="mt-2 text-sm font-medium text-red-500">Missing IEBC Cert</span>
			{/if}
		</span>
	</div>

	{#if form?.error}
		<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{/if}

	<!-- Decision controls: kept above the profile preview + history/team. -->
	<div class="mt-4 rounded-2xl border border-border bg-surface p-5">
		{#if request.outcome === 'rejected' && request.notes}
			<p class="mb-3 text-sm text-muted">
				<span class="font-semibold text-heading">Rejection reason:</span>
				{request.notes}
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			{#if request.outcome !== 'approved'}
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
			{#if request.outcome !== 'rejected'}
				<!-- Reject (pending) and Revert (approved) both carry a reason back to the {reviewNoun}. -->
				<form
					method="post"
					action="?/review"
					class="flex min-w-0 flex-1 flex-wrap items-center gap-2"
					use:enhance={({ cancel }) => {
						if (
							request.outcome === 'approved' &&
							!confirm(`Revert ${data.leader.name}'s ${reviewNoun === 'claimant' ? 'claim' : 'verification'}? Their profile ${reviewNoun === 'claimant' ? 'loses this manager access' : 'goes back off the public pages'} immediately.`)
						) {
							cancel();
						}
					}}
				>
					<input type="hidden" name="outcome" value="rejected" />
					<input
						type="text"
						name="notes"
						placeholder="Reason for {request.outcome === 'approved' ? 'reverting' : 'rejection'} (shown to the {reviewNoun})"
						class="min-w-64 flex-1 rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
					/>
					<button
						type="submit"
						class="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-heading transition hover:bg-surface-2"
					>
						{request.outcome === 'approved' ? 'Revert' : 'Reject'}
					</button>
				</form>
			{/if}
			{#if actionsExtra}{@render actionsExtra()}{/if}
		</div>
		{#if belowActions}{@render belowActions()}{/if}
	</div>

	<!-- Every request/claim ever made for this profile, newest first. -->
	<div class="mt-6">
		<h2 class="text-xl font-bold text-heading">{historyLabel}</h2>
		{#if requestHistory.length > 0}
			<div class="mt-4 overflow-x-auto rounded-2xl border border-border">
				<table class="w-full min-w-160 border-collapse text-left">
					<thead>
						<tr class="bg-surface-2">
							<th class="px-4 py-2.5 text-xs font-semibold text-heading">Requested</th>
							<th class="px-4 py-2.5 text-xs font-semibold text-heading">Outcome</th>
							<th class="px-4 py-2.5 text-xs font-semibold text-heading">Reviewed</th>
							<th class="px-4 py-2.5 text-xs font-semibold text-heading">Reviewer</th>
							<th class="px-4 py-2.5 text-xs font-semibold text-heading">Notes</th>
						</tr>
					</thead>
					<tbody>
						{#each requestHistory as h (h.id)}
							<tr class="border-t border-border">
								<td class="px-4 py-2.5 text-xs text-muted">{dateTimeFmt.format(new Date(h.requestedAt))}</td>
								<td class="px-4 py-2.5 text-xs capitalize text-heading">{h.outcome ?? 'pending'}</td>
								<td class="px-4 py-2.5 text-xs text-muted">{h.reviewedAt ? dateTimeFmt.format(new Date(h.reviewedAt)) : '—'}</td>
								<td class="px-4 py-2.5 text-xs text-muted">{h.reviewerName ?? '—'}</td>
								<td class="px-4 py-2.5 text-xs text-muted">{h.notes ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="mt-2 text-sm text-muted">No requests yet.</p>
		{/if}
	</div>

	<!-- Team, each with their own sign-off (role, national ID, ID images) -->
	<div class="mt-6">
		<h2 class="text-xl font-bold text-heading">Team &amp; sign-offs</h2>
		<p class="mt-1 text-sm text-muted">Each manager attests separately: their role, national ID, and ID images.</p>
		{#if team.length > 0}
			<div class="mt-5 grid gap-4 sm:grid-cols-2">
				{#each team as member (member.name)}
					<div class="rounded-2xl border border-border bg-surface-2/40 p-4">
						<div class="flex items-start gap-3">
							<div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
								{member.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
							</div>
							<div class="flex flex-1 flex-col gap-1">
								<div class="flex flex-wrap gap-1.5">
									<span class="truncate text-sm font-semibold text-heading">{member.name}</span>
									{#if member.isApplicant}
										<span class="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">applicant</span>
									{/if}
									{#if member.signoffComplete}
										<span class="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-on-primary">Signed off</span>
									{:else}
										<span class="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted">No sign-off</span>
									{/if}
								</div>
								<div class="flex flex-wrap gap-2 text-xs font-semibold text-muted">
									<span>{member.email ?? 'No email'}</span>
									<span>{member.phone ?? 'No phone'}</span>
								</div>
							</div>
						</div>
						<div class="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
							<div>
								<p class="text-xs font-semibold tracking-wide text-muted uppercase">Role</p>
								<p class="mt-0.5 text-sm {member.title ? 'text-heading' : 'font-medium text-red-500'}">{member.title ?? 'Missing'}</p>
							</div>
							<div>
								<p class="text-xs font-semibold tracking-wide text-muted uppercase">National ID</p>
								<p class="mt-0.5 text-sm {member.nationalId ? 'text-heading' : 'font-medium text-red-500'}">{member.nationalId ?? 'Missing'}</p>
							</div>
						</div>
						<div class="mt-3 grid grid-cols-2 gap-3">
							{@render idThumb('ID front', member.idFrontUrl)}
							{@render idThumb('ID back', member.idBackUrl)}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="mt-3 text-sm text-muted">No team members yet.</p>
		{/if}
	</div>
</div>

<LeaderProfile {data} preview />
