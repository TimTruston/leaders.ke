// Fetches readable text from a Knowledge-tab source LINK (see the Knowledge tab's
// "From a link" form) for review before it's saved as a knowledge_documents row.
// YouTube URLs get special handling via youtubei.js (an Innertube client — the
// same private API youtube.com's own web player calls) for title/description,
// which is solid. Transcript uses the `youtube-transcript` package instead —
// Innertube's own get_transcript endpoint now requires a BotGuard-derived PO
// token neither client supplies, while youtube-transcript pulls the caption
// track directly (InnerTube Android client context, falling back to scraping
// the timedtext URL out of the watch page HTML), which still works without one.
// Still best-effort: a video with captions disabled has nothing to fetch either
// way, so this degrades to title + description only when it fails.
import { parse as parseHtml } from 'node-html-parser';
import { Innertube } from 'youtubei.js';
import { YoutubeTranscript } from 'youtube-transcript';

let innertube: Innertube | null = null;
async function getInnertube(): Promise<Innertube> {
	innertube ??= await Innertube.create();
	return innertube;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_CHARS = 20_000;

export type LinkPreview = {
	kind: 'youtube' | 'link';
	title: string;
	content: string;
	sourceUrl: string;
};

/** Baseline SSRF guard: this endpoint is reachable only by an authenticated,
 * verified leader/manager (never the public), which narrows the real threat to a
 * malicious insider rather than an anonymous internet attacker — so a hostname-string
 * check (not full DNS-rebinding-proof resolution) is a reasonable bar here. Blocks
 * loopback, link-local/cloud-metadata, and RFC1918 private ranges. */
function isDisallowedHost(hostname: string): boolean {
	const h = hostname.toLowerCase();
	if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0' || h === '::1') return true;
	if (/^127\./.test(h)) return true;
	if (/^169\.254\./.test(h)) return true; // link-local, includes cloud metadata (169.254.169.254)
	if (/^10\./.test(h)) return true;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
	if (/^192\.168\./.test(h)) return true;
	return false;
}

function parsedUrlOrThrow(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error('That does not look like a valid URL.');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http/https links are supported.');
	if (isDisallowedHost(url.hostname)) throw new Error('That address cannot be fetched.');
	return url;
}

async function fetchText(url: URL): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: { 'user-agent': 'Mozilla/5.0 (compatible; leaders.ke-bot/1.0)' }
		});
		if (!res.ok) throw new Error(`The page returned ${res.status}.`);
		return await res.text();
	} finally {
		clearTimeout(timeout);
	}
}

function extractTitleAndBodyText(html: string): { title: string | null; content: string } {
	const root = parseHtml(html);
	const title = root.querySelector('title')?.textContent.trim() || null;
	root.querySelectorAll('script, style, nav, header, footer, noscript').forEach((el) => el.remove());
	// node-html-parser surfaces a leading <!DOCTYPE html> as literal text content
	// rather than treating it as a non-text declaration — strip it explicitly.
	const content = root.textContent
		.replace(/^\s*<!DOCTYPE[^>]*>\s*/i, '')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n\s*\n+/g, '\n\n')
		.trim();
	return { title, content };
}

function extractYouTubeVideoId(url: URL): string | null {
	if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1) || null;
	if (!url.hostname.endsWith('youtube.com')) return null;
	if (url.pathname === '/watch') return url.searchParams.get('v');
	const shorts = url.pathname.match(/^\/shorts\/([^/]+)/);
	if (shorts) return shorts[1];
	return null;
}

async function extractYouTubeTranscript(videoId: string): Promise<string | null> {
	try {
		const segments = await YoutubeTranscript.fetchTranscript(videoId);
		const text = segments
			.map((s) => s.text)
			.join(' ')
			.trim();
		return text || null;
	} catch (err) {
		// No captions on this video, or YouTube changed something again — degrade to
		// title + description only, not logged as an error.
		console.log(`[linkExtract] transcript unavailable for ${videoId}: ${err instanceof Error ? err.message : err}`);
		return null;
	}
}

async function extractYouTube(url: URL, videoId: string): Promise<LinkPreview> {
	const yt = await getInnertube();
	const info = await yt.getInfo(videoId);
	const title = info.basic_info.title ?? 'YouTube video';
	const description = info.basic_info.short_description ?? '';
	const transcript = await extractYouTubeTranscript(videoId);

	const content = [
		description ? `Description:\n${description}` : '',
		transcript ? `Transcript:\n${transcript}` : 'Transcript: not available for this video.'
	]
		.filter(Boolean)
		.join('\n\n')
		.slice(0, MAX_CONTENT_CHARS);

	return { kind: 'youtube', title, content, sourceUrl: url.toString() };
}

async function extractGenericLink(url: URL): Promise<LinkPreview> {
	const html = await fetchText(url);
	const { title, content } = extractTitleAndBodyText(html);
	if (!content) throw new Error('Could not find any readable text on that page.');
	return { kind: 'link', title: title ?? url.hostname, content: content.slice(0, MAX_CONTENT_CHARS), sourceUrl: url.toString() };
}

export async function previewLinkContent(raw: string): Promise<LinkPreview> {
	const url = parsedUrlOrThrow(raw);
	const videoId = extractYouTubeVideoId(url);
	return videoId ? extractYouTube(url, videoId) : extractGenericLink(url);
}
