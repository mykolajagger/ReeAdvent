import { handle } from '../../src/api.js';
export const onRequest = ctx => handle(ctx.request, ctx.env);
