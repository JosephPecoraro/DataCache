<?php

// Simplified RESTful API Interface
// Some Guidance from Gen X Design
// Source: http://www.gen-x-design.com/archives/create-a-rest-api-with-php/

include 'http.php';
include 'database.php';

function decode($incoming) {
  return json_decode(preg_replace('/\\\\"/', '"', $incoming), true);
}

// ----------------
//   CRUD Actions
// ----------------

function create($data) {
  $o = decode($data['data']);
  $sql = sprintf("insert into `drafts` values(%d, '%s', '%s', %d, %d, %d)",
    mysql_real_escape_string($o['id']),
    mysql_real_escape_string($o['timestamp']),
    mysql_real_escape_string($o['content']),
    mysql_real_escape_string($o['x']),
    mysql_real_escape_string($o['y']),
    mysql_real_escape_string($o['z']));
  mysql_query($sql) or die(mysql_error());
  headercode(201);
}

function update($data) {
  $o = decode($data['data']);
  $sql = sprintf("update drafts set `timestamp` = '%s', `content` = '%s', `x` = %d, `y` = %d, `z` = %d where `id` = %d",
    mysql_real_escape_string($o['timestamp']),
    mysql_real_escape_string($o['content']),
    mysql_real_escape_string($o['x']),
    mysql_real_escape_string($o['y']),
    mysql_real_escape_string($o['z']),
    mysql_real_escape_string($o['id']));
  mysql_query($sql) or die(mysql_error());
  headercode(200);
}

function delete($data) {
  $o = decode($data['data']);
  $sql = sprintf("delete from `drafts` where `id` = %d limit 1",
    mysql_real_escape_string($o['id']));
  mysql_query($sql) or die(mysql_error());
  headercode(200);
}

function error() {
  die("error");
}


// ------------
//   Dispatch
// ------------

$method = strtolower($_SERVER['REQUEST_METHOD']);
switch ($method) {
  case 'post':
    create($_POST);
    break;
  case 'put':
    parse_str(file_get_contents('php://input'), $data);
    update($data);
    break;
  case 'delete':
    parse_str(file_get_contents('php://input'), $data);
    delete($data);
    break;
  default:
    error();
    break;
}

?>