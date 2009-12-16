<?php

include 'database.php';

$sql = 'CREATE TABLE IF NOT EXISTS `drafts` (
         `id` int(11) unsigned NOT NULL auto_increment,
         `timestamp` bigint(20) NOT NULL,
         `content` varchar(150) NOT NULL,
         `x` smallint(6) NOT NULL,
         `y` smallint(6) NOT NULL,
         `z` smallint(6) NOT NULL,
         PRIMARY KEY  (`id`)
       ) ENGINE=MyISAM';

mysql_query($sql) or die(mysql_error());

?>
Created.