import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

// The why-vote pitch moved to the citizen platform; old links land there.
export const load: PageServerLoad = () => {
	redirect(302, `${env.PUBLIC_VOTE_BASE_URL ?? 'https://vote.ke'}/why-vote`);
};
