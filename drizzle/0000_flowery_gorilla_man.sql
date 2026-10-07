CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`token_hash` text,
	`token_expires_at` integer,
	`token_used_at` integer,
	`confirmation_sent_at` integer,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	`position` integer,
	`referral_code` text,
	`referred_by_code` text,
	`referral_credited` integer DEFAULT false NOT NULL,
	`moved_up_email_at` integer,
	`unsubscribed_at` integer,
	`bounced_at` integer,
	`spam_at` integer,
	`launch_status` text,
	`launch_attempted_at` integer,
	`launch_message_id` text,
	`launch_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_token_hash_unique` ON `users` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_referral_code_unique` ON `users` (`referral_code`);--> statement-breakpoint
CREATE INDEX `users_status_position` ON `users` (`status`,`position`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` integer NOT NULL
);
