CREATE TABLE `member_calendars` (
	`memberId` int NOT NULL,
	`token` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastFetchedAt` timestamp,
	CONSTRAINT `member_calendars_memberId` PRIMARY KEY(`memberId`),
	CONSTRAINT `member_calendars_token_unique` UNIQUE(`token`)
);
