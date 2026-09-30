import type { Env } from '../src/config';
import { appContext } from '../src/app';
import { privacyPage } from '../src/pages/static';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => privacyPage((await appContext(request, env)).ctx);
