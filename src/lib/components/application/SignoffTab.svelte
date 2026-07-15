<script lang="ts">
	// The applicant's attestation, shared by the apply (/dashboard/apply/[id]) and
	// claim (/dashboard/claim/[slug]) families: who they are to the campaign, their
	// national ID number, and their own ID images. Each family's +page.server.ts
	// shapes `data` and hosts the ?/saveMyDetails and ?/upload actions.
	import { enhance } from '$app/forms';
	import ImageCropper from '$lib/components/ImageCropper.svelte';
	import { CAMPAIGN_ROLES } from '$lib/utils/campaignRoles';

	let { data, form }: { data: any; form: any } = $props();

	const docs = $derived([
		{ kind: 'id-front', label: 'ID front', url: data.idFrontUrl },
		{ kind: 'id-back', label: 'ID back', url: data.idBackUrl }
	] as const);

	let uploading = $state(false);

	// Same crop-then-auto-upload flow as the Documentation tab: picking an image
	// opens the cropper, confirming submits — no separate upload button.
	let formEl: HTMLFormElement | undefined = $state();
	let inputs: Record<string, HTMLInputElement | undefined> = $state({});
	let cropping = $state<{ kind: string; file: File } | null>(null);

	function onFileChange(e: Event, kind: string) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
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

<svelte:head><title>Sign Off — leaders.ke</title></svelte:head>

<div class="">
	<h1 class="text-xl font-bold text-heading">Sign Off</h1>
	<p class="mt-1 text-sm text-muted">
		Provide the following details to sign off this application.
	</p>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">
			{form.error}
		</div>
	{:else if form?.detailsSaved}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Your details are saved.</div>
	{:else if form?.uploaded}
		<div class="mt-4 rounded-xl bg-primary-soft p-4 text-sm font-medium text-on-primary">Uploaded.</div>
	{/if}

	<form method="post" action="?/saveMyDetails" class="mt-6 rounded-2xl border border-border bg-surface p-5" use:enhance>
		<div class="flex flex-wrap items-end gap-2">
			<label class="min-w-48 flex-1">
				<span class="text-sm font-medium text-heading">My role <span class={data.myRole ? 'text-muted' : 'text-red-500'}>*</span></span>
				<select
					name="myRole"
					required
					value={data.myRole}
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				>
					<option value="" disabled>Pick your role</option>
					{#each CAMPAIGN_ROLES as role (role)}
						<option value={role}>{role}</option>
					{/each}
				</select>
			</label>
			<label class="min-w-48 flex-1">
				<span class="text-sm font-medium text-heading">My National ID <span class={data.nationalId ? 'text-muted' : 'text-red-500'}>*</span></span>
				<input
					type="text"
					name="nationalId"
					required
					value={data.nationalId}
					placeholder="12345678"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</label>
			<button
				type="submit"
				class="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:brightness-95"
			>
				Save
			</button>
		</div>
	</form>

	<form
		bind:this={formEl}
		method="post"
		action="?/upload"
		enctype="multipart/form-data"
		class="mt-4 space-y-4"
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
						accept="image/*"
						disabled={uploading}
						bind:this={inputs[doc.kind]}
						onchange={(e) => onFileChange(e, doc.kind)}
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
