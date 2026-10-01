CREATE TABLE `club_assets` (
	`key` varchar(20) NOT NULL,
	`image` mediumtext NOT NULL,
	`mime` varchar(30) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `club_assets_key` PRIMARY KEY(`key`)
);
