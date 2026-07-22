import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

interface Mail {
	to: string;
	subject: string;
	text: string;
	/** Rendered as the email's HTML alternative alongside `text` — needed for a
	 * clickable "Click here…" link rather than a bare URL (see notifications.ts). */
	html?: string;
}

/** Turns a relative in-app path into an absolute URL — a plain-text email has no
 * origin of its own, so a bare "/dashboard/..." link never becomes clickable. */
export function siteUrl(path: string): string {
	return `${publicEnv.PUBLIC_BASE_URL}${path}`;
}

/** Rewrites every relative href="/…" in an HTML string to an absolute URL — a
 * notification body is authored with in-app-relative links (so the dashboard's
 * @html render stays same-origin); an email opened elsewhere needs the full URL. */
export function toAbsoluteLinks(html: string): string {
	return html.replace(/href="(\/[^"]*)"/g, (_, path) => `href="${siteUrl(path)}"`);
}

/** Plain-text fallback for an HTML-authored body: keeps a link's visible text and
 * its target ("label: url") instead of silently dropping the link. */
export function stripLinks(html: string): string {
	return html.replace(/<a href="([^"]*)">(.*?)<\/a>/g, (_, href, label) => `${label}: ${href}`);
}

/**
 * Sends a transactional email. With POSTMARK_TOKEN set it posts to Postmark;
 * otherwise (dev) it logs the message to the console so email flows stay testable
 * without a provider — copy the link from the terminal.
 */
export async function sendEmail({ to, subject, text, html }: Mail): Promise<void> {
	const token = env.POSTMARK_TOKEN;
	const from = env.EMAIL_FROM || 'noreply@leaders.ke';

	if (!token) {
		console.log(`\n──── email (stub) ────\nto:      ${to}\nsubject: ${subject}\n\n${text}\n──────────────────────\n`);
		return;
	}

	const res = await fetch('https://api.postmarkapp.com/email', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'X-Postmark-Server-Token': token
		},
		body: JSON.stringify({ From: from, To: to, Subject: subject, TextBody: text, ...(html ? { HtmlBody: html } : {}), MessageStream: 'outbound' })
	});

	if (!res.ok) {
		throw new Error(`Postmark send failed (${res.status}): ${await res.text()}`);
	}
}
