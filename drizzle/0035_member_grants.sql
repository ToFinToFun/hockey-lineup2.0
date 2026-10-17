CREATE TABLE `member_grants` (
	`memberId` int NOT NULL,
	`admin` boolean NOT NULL DEFAULT false,
	`modules` json NOT NULL,
	`grantedBy` varchar(120) NOT NULL DEFAULT '',
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	CONSTRAINT `member_grants_memberId` PRIMARY KEY(`memberId`)
);
