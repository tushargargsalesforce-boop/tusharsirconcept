<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $statement = $pdo->prepare(
        'INSERT INTO age_consents (visitor_id) VALUES (:visitor_id)
         ON DUPLICATE KEY UPDATE accepted_at = CURRENT_TIMESTAMP'
    );
    $statement->execute(['visitor_id' => $visitorId]);
    json_response(['success' => true]);
});
