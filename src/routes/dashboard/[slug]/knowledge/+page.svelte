<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let addingFaq = $state(false);
	let uploading = $state(false);
	let faqQuestion = $state('');
	let faqAnswer = $state('');
	let docTitle = $state('');
	let fileInputEl: HTMLInputElement | undefined = $state();
</script>

<svelte:head><title>Knowledge — leaders.ke</title></svelte:head>

<div>
	<h2 class="text-xl font-bold text-heading">Knowledge</h2>
	<p class="text-sm text-muted">What the AI Chat feature knows and answers from — nothing more, nothing less.</p>

	<!-- Friendly, plain-language framing up front — this is the single place most
	     leaders/managers will misjudge or fear the AI feature, so it's addressed
	     before any form, not buried in a tooltip. -->
	<div class="mt-4 rounded-2xl border border-border bg-surface-2 p-5 text-sm text-muted">
		<p class="font-semibold text-heading">How this works, in plain terms</p>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			<li>Citizens can ask an AI questions about {data.faqs.length > 0 || data.documents.length > 0 ? 'this campaign' : 'campaigns'} on the public profile page.</li>
			<li>The AI only answers from what's on this page, plus the Leader, Contacts, Delivery, Campaign, News, Broadcasts, Reviews and Competition tabs — never anything it wasn't given.</li>
			<li>It never invents facts, promises, or positions. If something isn't written here, it says so and points citizens to follow the campaign instead.</li>
			<li>Nothing here is published on its own — it only ever surfaces as an AI-written answer to a citizen's specific question.</li>
		</ul>
	</div>

	{#if form?.error}
		<div class="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm font-medium text-heading">{form.error}</div>
	{/if}

	<!-- FAQ builder -->
	<div class="mt-6 rounded-2xl border border-border bg-surface p-5">
		<h3 class="font-semibold text-heading">Frequently asked questions</h3>
		<p class="mt-1 text-sm text-muted">Answer the questions citizens ask most — the AI leans on these first.</p>

		{#if data.faqs.length === 0}
			<p class="mt-3 text-sm text-muted">No FAQs yet.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.faqs as faq (faq.id)}
					<li class="rounded-xl bg-surface-2 p-4 text-sm">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="font-medium text-heading">{faq.question}</p>
								<p class="mt-1 text-muted">{faq.answer}</p>
							</div>
							<form
								method="post"
								action="?/removeFaq"
								use:enhance={() => async ({ update }) => update()}
							>
								<input type="hidden" name="id" value={faq.id} />
								<button type="submit" class="shrink-0 text-xs font-semibold text-muted hover:text-heading">Remove</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="post"
			action="?/addFaq"
			class="mt-4 space-y-3 border-t border-border pt-4"
			use:enhance={() => {
				addingFaq = true;
				return async ({ result, update }) => {
					addingFaq = false;
					if (result.type === 'success') {
						faqQuestion = '';
						faqAnswer = '';
					}
					await update({ reset: false });
				};
			}}
		>
			<label class="block">
				<span class="text-sm font-medium text-heading">Question</span>
				<input
					type="text"
					name="question"
					bind:value={faqQuestion}
					placeholder="What is your plan for youth unemployment?"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-heading">Answer</span>
				<textarea
					name="answer"
					bind:value={faqAnswer}
					rows="3"
					placeholder="Write the answer exactly as you'd want a citizen to read it — the AI may reuse this wording directly."
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				></textarea>
			</label>
			<button
				type="submit"
				disabled={!faqQuestion.trim() || !faqAnswer.trim() || addingFaq}
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{addingFaq ? 'Adding…' : 'Add FAQ'}
			</button>
		</form>
	</div>

	<!-- Document uploads -->
	<div class="mt-6 rounded-2xl border border-border bg-surface p-5">
		<h3 class="font-semibold text-heading">Source documents</h3>
		<p class="mt-1 text-sm text-muted">
			Manifestos, policy briefs, position papers. PDF, .txt or .md — under 10 MB. Text files feed the AI right away;
			PDF text extraction is coming soon, so for now prefer .txt/.md for anything you want the AI to actually quote from.
		</p>

		{#if data.documents.length === 0}
			<p class="mt-3 text-sm text-muted">No documents yet.</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.documents as doc (doc.id)}
					<li class="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-4 text-sm">
						<div class="min-w-0">
							<a href={doc.fileUrl} target="_blank" rel="noopener" class="font-medium text-heading hover:underline">{doc.title}</a>
							<p class="mt-0.5 text-xs text-muted">
								{doc.mimeType}
								{#if doc.textReady}· feeding the AI{:else}· not readable by the AI yet{/if}
							</p>
						</div>
						<form
							method="post"
							action="?/removeDocument"
							use:enhance={() => async ({ update }) => update()}
						>
							<input type="hidden" name="id" value={doc.id} />
							<button type="submit" class="shrink-0 text-xs font-semibold text-muted hover:text-heading">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form
			method="post"
			action="?/uploadDocument"
			enctype="multipart/form-data"
			class="mt-4 space-y-3 border-t border-border pt-4"
			use:enhance={() => {
				uploading = true;
				return async ({ result, update }) => {
					uploading = false;
					if (result.type === 'success') {
						docTitle = '';
						if (fileInputEl) fileInputEl.value = '';
					}
					await update({ reset: false });
				};
			}}
		>
			<label class="block">
				<span class="text-sm font-medium text-heading">Title</span>
				<input
					type="text"
					name="title"
					bind:value={docTitle}
					placeholder="2027 Manifesto (full)"
					class="mt-1.5 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-heading placeholder:text-muted focus:border-primary focus:ring-0 focus:ring-ring focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-heading">File</span>
				<input
					type="file"
					name="file"
					accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
					bind:this={fileInputEl}
					class="mt-1.5 block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-on-primary"
				/>
			</label>
			<button
				type="submit"
				disabled={!docTitle.trim() || uploading}
				class="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:brightness-95 disabled:opacity-60"
			>
				{uploading ? 'Uploading…' : 'Upload document'}
			</button>
		</form>
	</div>
</div>
