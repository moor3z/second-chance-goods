import type { Env } from '../src/config';
import { appContext } from '../src/app';
import { faqPage } from '../src/pages/local';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => faqPage((await appContext(request, env)).ctx);
