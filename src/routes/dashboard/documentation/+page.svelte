<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const docs = $derived(
		data.noProfile
			? []
			: ([
					{ kind: 'photo', label: 'Photo', accept: 'image/*', url: data.photoUrl },
					{ kind: 'id-front', label: 'ID — front', accept: 'image/*', url: data.idFrontUrl },
					{ kind: 'id-back', label: 'ID — back', accept: 'image/*', url: data.idBackUrl },
					{
						kind: 'iebc-certificate',
						label: 'IEBC Certificate of Clearance (PDF)',
						accept: 'application/pdf',
						url: data.iebcCertificateUrl
					}
				] as const)
	);
</script>

<svelte:head><title>Documentation — leaders.ke</title></svelte:head>

{#if data.noProfile}
	<div class="rounded-2xl border border-dashed border-border p-8 text-center">
		<p class="font-semibold text-heading">Save your profile first</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-muted">
			Documents are tied to your campaign profile — fill in the Leader's Profile tab, then come
			back here to upload.
		</p>
		<a
			href="/dashboard/profile"
			class="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95"
		>
			Go to Leader's Profile
		</a>
	</div>
{:else}
<div class="documents">
	<h1 class="text-xl font-bold text-heading">Documentation</h1>
	<p class="mt-1 text-sm text-muted">
		Needed to verify your campaign. An admin reviews these before your page goes public.
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{:else if form?.uploaded}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Uploaded.</div>
	{/if}

	<div class="mt-6 space-y-4">
		{#each docs as doc (doc.kind)}
			<div class="rounded-2xl border border-border bg-surface p-5">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="font-semibold text-heading">{doc.label}</p>
						{#if doc.url}
							<a href={doc.url} target="_blank" rel="noopener" class="text-sm text-primary hover:underline">
								View uploaded file
							</a>
						{:else}
							<p class="text-sm text-muted">Not uploaded yet.</p>
						{/if}
					</div>
					<form
						method="post"
						action="?/upload"
						enctype="multipart/form-data"
						class="flex items-center gap-2"
						use:enhance
					>
						<input type="hidden" name="kind" value={doc.kind} />
						<input
							type="file"
							name="file"
							accept={doc.accept}
							required
							class="max-w-60 text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-heading"
						/>
						<button
							type="submit"
							class="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-on-primary transition hover:brightness-95"
						>
							{doc.url ? 'Replace' : 'Upload'}
						</button>
					</form>
				</div>
			</div>
		{/each}
	</div>
</div>
{/if}
