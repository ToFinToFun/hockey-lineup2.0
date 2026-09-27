CREATE TABLE `player_photos` (
	`playerId` varchar(64) NOT NULL,
	`image` mediumtext NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_photos_playerId` PRIMARY KEY(`playerId`)
);
