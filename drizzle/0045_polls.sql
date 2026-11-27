CREATE TABLE `poll_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pollId` int NOT NULL,
	`device` varchar(64) NOT NULL,
	`memberId` int,
	`playerId` varchar(64),
	`choices` json NOT NULL,
	`ipHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `poll_votes_id` PRIMARY KEY(`id`),
	CONSTRAINT `poll_votes_device` UNIQUE(`pollId`,`device`)
);
--> statement-breakpoint
CREATE TABLE `polls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` varchar(12) NOT NULL,
	`title` varchar(120) NOT NULL,
	`description` text,
	`options` json NOT NULL,
	`multi` boolean NOT NULL DEFAULT false,
	`closesAt` timestamp,
	`closed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `polls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `poll_votes_member` ON `poll_votes` (`pollId`,`memberId`);