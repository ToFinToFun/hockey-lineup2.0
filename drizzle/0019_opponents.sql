CREATE TABLE `opponent_players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`opponentId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`number` varchar(4),
	`position` varchar(4),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `opponent_players_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opponents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`shortName` varchar(10),
	`color` varchar(7) NOT NULL DEFAULT '#ef4444',
	`logo` mediumtext,
	`logoMime` varchar(30),
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `opponents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `opponent_players_opponent_idx` ON `opponent_players` (`opponentId`);