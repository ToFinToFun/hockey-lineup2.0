ALTER TABLE `player_cards` ADD `liveProfile` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `player_cards` ADD `renderedHash` varchar(64);