<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

function random_room_token(): string
{
    return 'room_' . bin2hex(random_bytes(12));
}

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    upsert_visitor($pdo, $visitorId);

    $pdo->beginTransaction();

    $cleanup = $pdo->prepare(
        "UPDATE chat_rooms
         SET status = 'ended'
         WHERE status IN ('waiting', 'active')
           AND (visitor_one = :visitor_id OR visitor_two = :visitor_id)"
    );
    $cleanup->execute(['visitor_id' => $visitorId]);

    $find = $pdo->prepare(
        "SELECT room_token, visitor_one
         FROM chat_rooms
         WHERE status = 'waiting'
           AND visitor_one <> :visitor_id
           AND updated_at > (NOW() - INTERVAL 10 MINUTE)
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE"
    );
    $find->execute(['visitor_id' => $visitorId]);
    $room = $find->fetch();

    if ($room) {
        $join = $pdo->prepare(
            "UPDATE chat_rooms
             SET visitor_two = :visitor_id, status = 'active'
             WHERE room_token = :room_token"
        );
        $join->execute([
            'visitor_id' => $visitorId,
            'room_token' => $room['room_token'],
        ]);
        $pdo->commit();

        json_response([
            'success' => true,
            'message' => 'Matched with a stranger',
            'room_token' => $room['room_token'],
            'role' => 'joiner',
            'status' => 'active',
        ]);
    }

    $roomToken = random_room_token();
    $create = $pdo->prepare(
        "INSERT INTO chat_rooms (room_token, visitor_one, status)
         VALUES (:room_token, :visitor_id, 'waiting')"
    );
    $create->execute([
        'room_token' => $roomToken,
        'visitor_id' => $visitorId,
    ]);
    $pdo->commit();

    json_response([
        'success' => true,
        'message' => 'Waiting for a stranger',
        'room_token' => $roomToken,
        'role' => 'creator',
        'status' => 'waiting',
    ]);
});
