CREATE TABLE `lineup_operations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seq` bigint NOT NULL,
	`opType` varchar(50) NOT NULL,
	`description` varchar(500) NOT NULL DEFAULT '',
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lineup_operations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lineup_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`players` json NOT NULL,
	`lineup` json NOT NULL,
	`teamAName` varchar(100) NOT NULL DEFAULT 'VITA',
	`teamBName` varchar(100) NOT NULL DEFAULT 'GRÖNA',
	`teamAConfig` json,
	`teamBConfig` json,
	`deletedPlayerIds` json,
	`version` bigint NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lineup_state_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_lineups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shareId` varchar(20) NOT NULL,
	`name` varchar(200) NOT NULL,
	`teamAName` varchar(100) NOT NULL,
	`teamBName` varchar(100) NOT NULL,
	`lineup` json NOT NULL,
	`favorite` boolean NOT NULL DEFAULT false,
	`savedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_lineups_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_lineups_shareId_unique` UNIQUE(`shareId`)
);
