<?php

// Connect to the database.
// NOTE: see createDatabase.php for the table's schema
include 'database.php';

// Get all drafts
$sql = 'select * from drafts';
$result = mysql_query($sql) or die(mysql_error());

// Collect into an array
$arr = array();
while ($record = mysql_fetch_assoc($result))
  $arr[] = $record;

// Return JSON
header('Content-type: application/json');
echo json_encode($arr);

?>