CREATE TABLE `match_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matchId` int NOT NULL,
	`seq` int NOT NULL,
	`team` enum('white','green') NOT NULL,
	`scorerId` varchar(64),
	`assistId` varchar(64),
	`scorerName` varchar(120),
	`assistName` varchar(120),
	`goalType` varchar(60),
	`sponsor` varchar(120),
	`time` varchar(20) NOT NULL DEFAULT '',
	CONSTRAINT `match_goals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `match_players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matchId` int NOT NULL,
	`playerId` varchar(64) NOT NULL,
	`team` enum('white','green') NOT NULL,
	`slot` varchar(40) NOT NULL,
	`position` varchar(4) NOT NULL,
	CONSTRAINT `match_players_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `lineup_state` ADD `slots` json;--> statement-breakpoint
ALTER TABLE `lineup_state` ADD `attendance` json;--> statement-breakpoint
CREATE INDEX `match_goals_match_idx` ON `match_goals` (`matchId`);--> statement-breakpoint
CREATE INDEX `match_goals_scorer_idx` ON `match_goals` (`scorerId`);--> statement-breakpoint
CREATE INDEX `match_goals_assist_idx` ON `match_goals` (`assistId`);--> statement-breakpoint
CREATE INDEX `match_players_match_idx` ON `match_players` (`matchId`);--> statement-breakpoint
CREATE INDEX `match_players_player_idx` ON `match_players` (`playerId`);--> statement-breakpoint
CREATE INDEX `match_results_review_idx` ON `match_results` (`reviewStatus`);--> statement-breakpoint
CREATE INDEX `match_results_end_idx` ON `match_results` (`matchEndTime`);