import type { Config } from '@netlify/functions';
import { getUser, refreshSession, verifyRequestOrigin } from '@netlify/identity';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { episodes } from '../../db/schema.js';

function json(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default async function handler(request: Request) {
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST, DELETE' } });
    }

    try {
        if (request.method === 'GET') {
            const rows = await getDb().select({ videoId: episodes.videoId }).from(episodes)
                .orderBy(asc(episodes.createdAt), asc(episodes.videoId));
            return json({ videoIds: rows.map(row => row.videoId) });
        }

        try {
            verifyRequestOrigin(request);
        } catch {
            return json({ error: 'Requests must come from this website.' }, 403);
        }

        await refreshSession();
        const user = await getUser();
        if (!user) return json({ error: 'Please sign in again.' }, 401);
        if (!user.invitedAt || !user.confirmedAt || !user.roles?.includes('admin')) {
            return json({ error: 'Only invited administrators can manage episodes.' }, 403);
        }

        if (!request.headers.get('content-type')?.startsWith('application/json')) {
            return json({ error: 'Send episode data as JSON.' }, 415);
        }
        const text = await request.text();
        if (text.length > 16384) return json({ error: 'Too many episodes in one request.' }, 413);
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            return json({ error: 'Invalid episode data.' }, 400);
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return json({ error: 'Invalid episode data.' }, 400);
        }

        if (request.method === 'POST') {
            const videoIds = body.videoIds;
            if (!Array.isArray(videoIds) || videoIds.length < 1 || videoIds.length > 500 ||
                !videoIds.every(videoId => typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId))) {
                return json({ error: 'Provide between 1 and 500 valid YouTube episode IDs.' }, 400);
            }
            const uniqueIds = [...new Set<string>(videoIds)];
            const added = await getDb().insert(episodes)
                .values(uniqueIds.map(videoId => ({ videoId, addedBy: user.id })))
                .onConflictDoNothing().returning({ videoId: episodes.videoId });
            return json({ added: added.length });
        }

        if (typeof body.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(body.videoId)) {
            return json({ error: 'Invalid YouTube episode ID.' }, 400);
        }
        await getDb().delete(episodes).where(eq(episodes.videoId, body.videoId));
        return json({ removed: true });
    } catch {
        return json({ error: 'Episode storage is temporarily unavailable. Please try again.' }, 503);
    }
}

export const config: Config = { path: '/api/episodes' };
