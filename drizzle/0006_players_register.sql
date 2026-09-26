CREATE TABLE `players` (
	`id` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`number` varchar(10) NOT NULL DEFAULT '',
	`position` varchar(4) NOT NULL DEFAULT 'F',
	`teamColor` varchar(10),
	`captainRole` varchar(2),
	`isMember` boolean NOT NULL DEFAULT true,
	`active` boolean NOT NULL DEFAULT true,
	`lagetName` varchar(150),
	`externalId` varchar(64),
	`aliases` json,
	`mergedInto` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `players_id` PRIMARY KEY(`id`)
);
