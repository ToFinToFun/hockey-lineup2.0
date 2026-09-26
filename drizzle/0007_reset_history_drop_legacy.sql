-- Nystart inför säsongen: all gammal historik tas bort (beslut 2026-09-26).
DELETE FROM `match_results`;--> statement-breakpoint
DELETE FROM `saved_lineups`;--> statement-breakpoint
DELETE FROM `players` WHERE `mergedInto` IS NOT NULL;--> statement-breakpoint
DELETE FROM `app_config` WHERE `key` = 'data_migrations';--> statement-breakpoint
ALTER TABLE `lineup_state` DROP COLUMN `players`;--> statement-breakpoint
ALTER TABLE `lineup_state` DROP COLUMN `lineup`;--> statement-breakpoint
ALTER TABLE `lineup_state` DROP COLUMN `deletedPlayerIds`;--> statement-breakpoint
ALTER TABLE `match_results` DROP COLUMN `goalHistory`;--> statement-breakpoint
ALTER TABLE `match_results` DROP COLUMN `lineup`;--> statement-breakpoint
ALTER TABLE `players` DROP COLUMN `aliases`;--> statement-breakpoint
ALTER TABLE `players` DROP COLUMN `mergedInto`;