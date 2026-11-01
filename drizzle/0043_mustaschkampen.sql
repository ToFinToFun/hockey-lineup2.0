-- Movember blir Mustaschkampen (Prostatacancerförbundets kampanj i november).
-- Temats namn och förval byts bara där de inte ändrats i appen.
UPDATE `media_themes` SET `name` = 'Mustaschkampen' WHERE `builtin` = 'movember' AND `name` = 'Movember';
--> statement-breakpoint
UPDATE `media_themes` SET `title` = 'Var med i Mustaschkampen' WHERE `builtin` = 'movember' AND `title` = 'Make a Growmitment';
--> statement-breakpoint
UPDATE `media_themes` SET `subtitle` = 'Tillsammans mot prostatacancer' WHERE `builtin` = 'movember' AND `subtitle` = 'Against prostate cancer';
--> statement-breakpoint
UPDATE `media_themes` SET `slogan` = 'Mer forskning räddar fler liv' WHERE `builtin` = 'movember' AND `slogan` = 'Grow together • Change men''s health';
--> statement-breakpoint
UPDATE `media_themes` SET `tags` = '#mustaschkampen' WHERE `builtin` = 'movember' AND `tags` = '#movember';
--> statement-breakpoint
-- Sparade kampanjinlägg: samma byte där texterna fortfarande är de gamla förvalen
UPDATE `media_posts` SET `settings` = JSON_SET(`settings`, '$.title', 'Var med i Mustaschkampen') WHERE `type` = 'campaign' AND JSON_UNQUOTE(JSON_EXTRACT(`settings`, '$.title')) = 'Make a Growmitment';
--> statement-breakpoint
UPDATE `media_posts` SET `settings` = JSON_SET(`settings`, '$.subtitle', 'Tillsammans mot prostatacancer') WHERE `type` = 'campaign' AND JSON_UNQUOTE(JSON_EXTRACT(`settings`, '$.subtitle')) = 'Against prostate cancer';
--> statement-breakpoint
UPDATE `media_posts` SET `settings` = JSON_SET(`settings`, '$.slogan', 'Mer forskning räddar fler liv') WHERE `type` = 'campaign' AND JSON_UNQUOTE(JSON_EXTRACT(`settings`, '$.slogan')) = 'Grow together • Change men''s health';
--> statement-breakpoint
UPDATE `media_posts` SET `title` = REPLACE(REPLACE(`title`, 'Make a Growmitment', 'Var med i Mustaschkampen'), 'Movember:', 'Mustaschkampen:') WHERE `type` = 'campaign';
--> statement-breakpoint
UPDATE `media_posts` SET `caption` = REPLACE(REPLACE(REPLACE(REPLACE(`caption`, 'Make a Growmitment', 'Var med i Mustaschkampen'), 'Against prostate cancer', 'Tillsammans mot prostatacancer'), 'Grow together • Change men''s health', 'Mer forskning räddar fler liv'), '#movember', '#mustaschkampen') WHERE `type` = 'campaign' AND `caption` IS NOT NULL;
