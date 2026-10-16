CREATE TABLE `member_sessions` (
	`id` varchar(36) NOT NULL,
	`memberId` int NOT NULL,
	`device` varchar(120) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `member_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `member_sessions_member_idx` ON `member_sessions` (`memberId`);