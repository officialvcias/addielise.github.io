CREATE TABLE "episodes" (
	"video_id" text PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" text NOT NULL
);
