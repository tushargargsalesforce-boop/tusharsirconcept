<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $roomToken = clean_string($data, 'room_token', 80);
    $partnerId = active_chat_partner($pdo, $visitorId, $roomToken);
    $statement = $pdo->prepare(
        'INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES (:blocker_id, :blocked_id)
         ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP'
    );
    $statement->execute(['blocker_id' => $visitorId, 'blocked_id' => $partnerId]);
    json_response(['success' => true, 'message' => 'User blocked']);
});
