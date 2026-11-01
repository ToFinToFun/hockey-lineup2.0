CREATE TABLE `media_post_photos` (
	`postId` int NOT NULL,
	`idx` int NOT NULL,
	`image` mediumtext NOT NULL,
	CONSTRAINT `media_post_photos_post_idx` UNIQUE(`postId`,`idx`)
);
--> statement-breakpoint
CREATE TABLE `media_themes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(60) NOT NULL,
	`builtin` varchar(20),
	`accent` varchar(9) NOT NULL DEFAULT '#2e9e44',
	`title` varchar(80) NOT NULL DEFAULT '',
	`subtitle` varchar(120) NOT NULL DEFAULT '',
	`slogan` varchar(80) NOT NULL DEFAULT '',
	`tags` varchar(200) NOT NULL DEFAULT '',
	`background` varchar(20) NOT NULL DEFAULT 'arena',
	`dim` int NOT NULL DEFAULT 55,
	`logo` mediumtext,
	`photo` mediumtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `media_themes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `media_themes` (`name`, `builtin`, `accent`, `title`, `subtitle`, `slogan`, `tags`, `background`, `dim`) VALUES ('Movember', 'movember', '#55c652', 'Make a Growmitment', 'Against prostate cancer', 'Grow together • Change men''s health', '#movember', 'host', 55);
