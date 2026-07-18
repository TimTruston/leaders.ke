import { redirect } from '@sveltejs/kit';
import { SINGULAR_POSITION_SLUGS } from '$lib/utils/seat';
import type { PageServerLoad } from './$types';

// /governor/mombasa → /governors/mombasa (canonical plural taxonomy).
export const load: PageServerLoad = ({ params }) => {
	redirect(301, `/${SINGULAR_POSITION_SLUGS[params.position]}/${params.region}`);
};
