// AI constituent chat: answers questions grounded in a leader's profile,
// manifesto and public posts. Uses the Claude API when ANTHROPIC_API_KEY is
// set; otherwise a keyword-match fallback keeps the feature testable in dev.
import { env } from '$env/dynamic/private';
import Anthropic from '@anthropic-ai/sdk';

export type LeaderGrounding = {
	name: string;
	positionTitle: string;
	regionLabel: string;
	status: string;
	bio: string;
	pillars: { title: string; summary: string; deliveryStatus?: string; evidence?: string | null }[];
	posts: { title: string; body: string }[];
	// Knowledge tab (see $lib/server/knowledge.ts) — a team-curated FAQ plus
	// extracted text from uploaded source documents. Optional: older call sites
	// that haven't been updated to fetch these still work, just with less grounding.
	faqs?: { question: string; answer: string }[];
	documents?: { title: string; text: string }[];
};

export type ConstituentAnswer = {
	answer: string;
	source: 'ai' | 'heuristic';
};

function groundingText(leader: LeaderGrounding): string {
	const pillars = leader.pillars
		.map(
			(p, i) =>
				`${i + 1}. ${p.title} [${p.deliveryStatus ?? 'promised'}]: ${p.summary}${p.evidence ? ` Evidence: ${p.evidence}` : ''}`
		)
		.join('\n');
	const posts = leader.posts.map((p) => `- ${p.title}: ${p.body}`).join('\n');
	const faqs = (leader.faqs ?? []).map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
	const documents = (leader.documents ?? [])
		.map((d) => `--- ${d.title} ---\n${d.text}`)
		.join('\n\n');
	return [
		`Leader: ${leader.name}, ${leader.status} for ${leader.positionTitle}, ${leader.regionLabel}, Kenya.`,
		leader.bio ? `Bio: ${leader.bio}` : '',
		pillars ? `Manifesto pillars:\n${pillars}` : 'No manifesto published yet.',
		posts ? `Recent public updates:\n${posts}` : 'No public updates yet.',
		// FAQs take priority over free-form documents — a team member wrote these
		// answers exactly as they want a citizen to read them.
		faqs ? `Team-written FAQ (prefer this wording when it answers the question):\n${faqs}` : '',
		documents ? `Source documents:\n${documents}` : ''
	]
		.filter(Boolean)
		.join('\n\n');
}

async function askClaude(leader: LeaderGrounding, question: string): Promise<string> {
	const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	const response = await client.messages.create({
		model: 'claude-opus-4-8',
		max_tokens: 1024,
		thinking: { type: 'adaptive' },
		system: [
			'You answer citizens\' questions about a Kenyan political leader on leaders.ke.',
			'Ground every claim ONLY in the profile below. If the answer is not in the profile,',
			'say the campaign has not published a position on that and suggest following the',
			'campaign or asking the team directly. Never invent promises, positions or facts.',
			'Stay neutral in tone, keep answers under 120 words, plain language.',
			'',
			groundingText(leader)
		].join('\n')
	,
		messages: [{ role: 'user', content: question }]
	});
	if (response.stop_reason === 'refusal') {
		return 'I can\'t help with that question. Try asking about the manifesto, track record or campaign updates.';
	}
	const textBlock = response.content.find((b) => b.type === 'text');
	return textBlock?.text ?? 'No answer available right now; please try again.';
}

// Dev fallback: rank FAQs/pillars/posts by word overlap with the question and quote
// the best matches. FAQs win when they match — a team member wrote that answer
// specifically for this question.
function heuristicAnswer(leader: LeaderGrounding, question: string): string {
	const words = question
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 3);

	const score = (text: string) =>
		words.reduce((n, w) => (text.toLowerCase().includes(w) ? n + 1 : n), 0);

	const bestFaq = [...(leader.faqs ?? [])]
		.map((f) => ({ f, s: score(`${f.question} ${f.answer}`) }))
		.sort((a, b) => b.s - a.s)[0];
	if (bestFaq && bestFaq.s > 0) return bestFaq.f.answer;

	const bestPillar = [...leader.pillars]
		.map((p) => ({ p, s: score(`${p.title} ${p.summary}`) }))
		.sort((a, b) => b.s - a.s)[0];
	const bestPost = [...leader.posts]
		.map((p) => ({ p, s: score(`${p.title} ${p.body}`) }))
		.sort((a, b) => b.s - a.s)[0];

	const parts: string[] = [];
	if (bestPillar && bestPillar.s > 0) {
		parts.push(
			`From the manifesto pillar "${bestPillar.p.title}": ${bestPillar.p.summary}`
		);
	}
	if (bestPost && bestPost.s > 0) {
		parts.push(`From a campaign update, "${bestPost.p.title}": ${bestPost.p.body}`);
	}
	if (parts.length === 0) {
		return `${leader.name}'s campaign has not published a position on that yet. Follow the campaign to ask the team directly and get updates.`;
	}
	return parts.join('\n\n');
}

export async function answerConstituentQuestion(
	leader: LeaderGrounding,
	question: string
): Promise<ConstituentAnswer> {
	if (env.ANTHROPIC_API_KEY) {
		try {
			return { answer: await askClaude(leader, question), source: 'ai' };
		} catch (err) {
			console.error('AI answer failed, falling back to heuristic:', err);
		}
	}
	return { answer: heuristicAnswer(leader, question), source: 'heuristic' };
}
