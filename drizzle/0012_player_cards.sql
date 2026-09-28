CREATE TABLE `player_cards` (
	`playerId` varchar(64) NOT NULL,
	`source` mediumtext NOT NULL,
	`settings` json NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_cards_playerId` PRIMARY KEY(`playerId`)
);
