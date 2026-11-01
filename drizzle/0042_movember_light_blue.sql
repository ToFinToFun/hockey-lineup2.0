-- Movember: samma ljusblå som tröjan i den nya loggan – bara om färgen inte ändrats i appen
UPDATE `media_themes` SET `accent` = '#60b8f8' WHERE `builtin` = 'movember' AND `accent` IN ('#55c652', '#4b9cf0');
