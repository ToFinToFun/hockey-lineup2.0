-- Movember i ljusblått (klubbens blå, ljusare så att texten syns på mörk bakgrund) – bara om färgen inte ändrats i appen
UPDATE `media_themes` SET `accent` = '#4b9cf0' WHERE `builtin` = 'movember' AND `accent` = '#55c652';
