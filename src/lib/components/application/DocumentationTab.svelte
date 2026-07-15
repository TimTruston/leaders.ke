<script lang="ts">
	import { enhance } from '$app/forms';
	import ImageCropper from '$lib/components/ImageCropper.svelte';

	// Shared across the campaign (/dashboard/[slug]), apply (/dashboard/apply/[id]) and
	// claim (/dashboard/claim/[slug]) route families - each family's +page.server.ts
	// shapes `data` and hosts the actions this form posts to (relative ?/action URLs).
	let { data, form }: { data: any; form: any } = $props();

	// The campaign's own items — the applicant's ID images live on the Signoff tab.
	const docs = $derived(([
					{ kind: 'photo', label: "Leader's Photo", accept: 'image/*', url: data.photoUrl },
					{
						kind: 'iebc-certificate',
						label: 'IEBC Certificate of Clearance (PDF)',
						accept: 'application/pdf',
						url: data.iebcCertificateUrl
					}
			] as const)
	);

	let uploading = $state(false);

	// No submit button: picking a file uploads it. Images pass through a free-crop
	// modal first (confirming the crop submits); the PDF certificate goes straight up.
	let formEl: HTMLFormElement | undefined = $state();
	let inputs: Record<string, HTMLInputElement | undefined> = $state({});
	let cropping = $state<{ kind: string; file: File } | null>(null);

	function onFileChange(e: Event, kind: string, accept: string) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (accept === 'application/pdf') {
			formEl?.requestSubmit();
			return;
		}
		// Hold the original for the cropper; the cropped result replaces it on confirm.
		input.value = '';
		cropping = { kind, file };
	}

	function onCropConfirm(cropped: File) {
		if (!cropping) return;
		const input = inputs[cropping.kind];
		cropping = null;
		if (!input) return;
		const dt = new DataTransfer();
		dt.items.add(cropped);
		input.files = dt.files;
		formEl?.requestSubmit();
	}
</script>

<svelte:head><title>Documentation — leaders.ke</title></svelte:head>

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

	<form
		bind:this={formEl}
		method="post"
		action="?/upload"
		enctype="multipart/form-data"
		class="mt-6 space-y-4"
		use:enhance={() => {
			uploading = true;
			return async ({ update }) => {
				uploading = false;
				await update();
			};
		}}
	>
		{#each docs as doc (doc.kind)}
			<div class="rounded-2xl border border-border bg-surface p-5">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="font-semibold text-heading">{doc.label} <span class={doc.url ? 'text-muted' : 'text-red-500'}>*</span></p>
						{#if doc.url}
							<a href={doc.url} target="_blank" rel="noopener" class="text-sm text-primary hover:underline">
								View uploaded file
							</a>
						{:else}
							<p class="text-sm text-muted">Not uploaded yet.</p>
						{/if}
					</div>
					<input
						type="file"
						name={doc.kind}
						accept={doc.accept}
						disabled={uploading}
						bind:this={inputs[doc.kind]}
						onchange={(e) => onFileChange(e, doc.kind, doc.accept)}
						class="max-w-60 text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-heading"
					/>
				</div>
			</div>
		{/each}

		{#if uploading}
			<p class="text-sm font-medium text-muted">Uploading…</p>
		{/if}
	</form>
</div>

{#if cropping}
	<ImageCropper file={cropping.file} onconfirm={onCropConfirm} oncancel={() => (cropping = null)} />
{/if}
