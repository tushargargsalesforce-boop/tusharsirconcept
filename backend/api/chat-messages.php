<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $roomToken = clean_string($data, 'room_token', 80);
    $afterId = filter_var($data['after_id'] ?? 0, FILTER_VALIDATE_INT);
    $afterId = $afterId === false ? 0 : $afterId;

    $room = $pdo->prepare(
        'SELECT id FROM chat_rooms
         WHERE room_token = :room_token
           AND (visitor_one = :visitor_id OR visitor_two = :visitor_id)'
    );
    $room->execute([
        'room_token' => $roomToken,
        'visitor_id' => $visitorId,
    ]);

    if (!$room->fetch()) {
        json_response(['success' => false, 'message' => 'Chat room not found'], 404);
    }

    $stmt = $pdo->prepare(
        'SELECT id, sender_id, message_text, created_at
         FROM chat_messages
         WHERE room_token = :room_token AND id > :after_id
         ORDER BY id ASC
         LIMIT 60'
    );
    $stmt->bindValue(':room_token', $roomToken, PDO::PARAM_STR);
    $stmt->bindValue(':after_id', $afterId, PDO::PARAM_INT);
    $stmt->execute();

    $messages = array_map(static function (array $row) use ($visitorId): array {
        return [
            'id' => (int)$row['id'],
            'sender' => $row['sender_id'] === $visitorId ? 'you' : 'stranger',
            'message_text' => $row['message_text'],
            'created_at' => $row['created_at'],
        ];
    }, $stmt->fetchAll());

    json_response(['success' => true, 'messages' => $messages]);
});
