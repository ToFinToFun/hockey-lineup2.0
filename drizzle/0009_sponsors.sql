CREATE TABLE `sponsor_news` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sponsorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sponsor_news_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`logo` mediumtext,
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sponsors_id` PRIMARY KEY(`id`),
	CONSTRAINT `sponsors_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `sponsor_news_sponsor_idx` ON `sponsor_news` (`sponsorId`);--> statement-breakpoint
CREATE INDEX `sponsor_news_created_idx` ON `sponsor_news` (`createdAt`);--> statement-breakpoint
INSERT IGNORE INTO `sponsors` (`name`, `sortOrder`) VALUES ('Polar', 1), ('lindstromstransport', 2), ('Kirunabilfrakt', 3), ('Ren', 4);
