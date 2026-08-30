<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $roomToken = clean_string($data, 'room_token', 80);
    $message = clean_string($data, 'message_text', 1000);

    $room = $pdo->prepare(
        "SELECT id FROM chat_rooms
         WHERE room_token = :room_token
           AND status = 'active'
           AND (visitor_one = :visitor_id OR visitor_two = :visitor_id)"
    );
    $room->execute([
        'room_token' => $roomToken,
        'visitor_id' => $visitorId,
    ]);

    if (!$room->fetch()) {
        json_response(['success' => false, 'message' => 'Active chat room not found'], 404);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO chat_messages (room_token, sender_id, message_text)
         VALUES (:room_token, :sender_id, :message_text)'
    );
    $stmt->execute([
        'room_token' => $roomToken,
        'sender_id' => $visitorId,
        'message_text' => $message,
    ]);

    json_response(['success' => true, 'message' => 'Message sent']);
});
