ALTER TABLE `activities` ADD `notifyEmail` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `reminderHours` int;--> statement-breakpoint
ALTER TABLE `activities` ADD `notifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `activities` ADD `remindedAt` timestamp;--> statement-breakpoint
ALTER TABLE `activities` ADD `cancelNotifiedAt` timestamp;