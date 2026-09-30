import type { Env } from '../src/config';
import { appContext } from '../src/app';
import { termsPage } from '../src/pages/static';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => termsPage((await appContext(request, env)).ctx);
