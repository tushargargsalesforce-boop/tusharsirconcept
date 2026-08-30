<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    upsert_visitor($pdo, $visitorId);

    $stmt = $pdo->prepare('UPDATE date_responses SET yes_response = TRUE WHERE visitor_id = :visitor_id');
    $stmt->execute(['visitor_id' => $visitorId]);

    json_response(['success' => true, 'message' => 'Response saved']);
});
