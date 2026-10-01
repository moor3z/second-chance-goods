import type { Env } from '../src/config';
import { appContext } from '../src/app';
import { aboutPage } from '../src/pages/static';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => aboutPage((await appContext(request, env)).ctx);
