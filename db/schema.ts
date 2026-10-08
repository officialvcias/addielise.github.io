import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const episodes = pgTable('episodes', {
    videoId: text('video_id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    addedBy: text('added_by').notNull(),
});
