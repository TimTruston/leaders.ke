<script lang="ts">
	// "Continue with Google" for the login and signup pages. Posts to the page's
	// ?/google action, which starts the OAuth flow and 302s to Google — so this is
	// a plain form (no use:enhance), letting the browser follow the external
	// redirect natively. `next` rides along as a hidden field since ?/google drops
	// the page's own query string.
	let { label = 'Continue with Google', next = '/dashboard' }: { label?: string; next?: string } = $props();
</script>

<form method="post" action="?/google">
	<input type="hidden" name="next" value={next} />
	<button
		type="submit"
		class="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-2.5 font-semibold text-heading transition hover:bg-surface-2 focus:ring-0 focus:ring-ring focus:outline-none"
	>
		<svg viewBox="0 0 24 24" class="size-5" aria-hidden="true">
			<path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
			<path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1 .7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
			<path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
			<path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.2 6.9 8.9 4.8 12 4.8Z" />
		</svg>
		{label}
	</button>
</form>
