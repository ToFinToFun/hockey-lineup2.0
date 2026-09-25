DROP TABLE IF EXISTS `app_secrets`;--> statement-breakpoint
DROP TABLE IF EXISTS `users`;--> statement-breakpoint
ALTER TABLE `match_results` ADD `reviewStatus` enum('pending','approved','rejected') DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE `match_results` ADD `reviewedAt` timestamp;