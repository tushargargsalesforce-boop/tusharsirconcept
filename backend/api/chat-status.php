<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $roomToken = clean_string($data, 'room_token', 80);

    $stmt = $pdo->prepare(
        'SELECT room_token, visitor_one, visitor_two, status
         FROM chat_rooms
         WHERE room_token = :room_token
           AND (visitor_one = :visitor_id OR visitor_two = :visitor_id)'
    );
    $stmt->execute([
        'room_token' => $roomToken,
        'visitor_id' => $visitorId,
    ]);
    $room = $stmt->fetch();

    if (!$room) {
        json_response(['success' => false, 'message' => 'Chat room not found'], 404);
    }

    $partnerId = $room['visitor_one'] === $visitorId ? $room['visitor_two'] : $room['visitor_one'];

    json_response([
        'success' => true,
        'status' => $room['status'],
        'has_partner' => $partnerId !== null,
        'partner_label' => $partnerId ? 'Stranger ' . substr((string)$partnerId, -4) : null,
        'is_creator' => $room['visitor_one'] === $visitorId,
    ]);
});
