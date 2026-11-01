CREATE TABLE `campaign_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`themeId` int NOT NULL,
	`playerId` varchar(64),
	`name` varchar(60) NOT NULL,
	`number` varchar(3),
	`image` mediumtext NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`device` varchar(64) NOT NULL,
	`ipHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `campaign_entries_theme` ON `campaign_entries` (`themeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `campaign_entries_device` ON `campaign_entries` (`device`);