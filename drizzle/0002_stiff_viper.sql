CREATE TABLE `app_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_config_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `match_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`teamWhiteScore` int NOT NULL,
	`teamGreenScore` int NOT NULL,
	`goalHistory` json,
	`matchStartTime` timestamp,
	`matchEndTime` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`editedAt` timestamp,
	`lineup` json,
	CONSTRAINT `match_results_id` PRIMARY KEY(`id`)
);
