<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $roomToken = clean_string($data, 'room_token', 80);

    $stmt = $pdo->prepare(
        "UPDATE chat_rooms
         SET status = 'ended'
         WHERE room_token = :room_token
           AND (visitor_one = :visitor_id OR visitor_two = :visitor_id)"
    );
    $stmt->execute([
        'room_token' => $roomToken,
        'visitor_id' => $visitorId,
    ]);

    json_response(['success' => true, 'message' => 'Chat ended']);
});
