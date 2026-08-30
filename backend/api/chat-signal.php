<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $roomToken = clean_string($data, 'room_token', 80);
    $signalType = clean_string($data, 'signal_type', 20);
    $payload = $data['signal_payload'] ?? null;

    if (!in_array($signalType, ['offer', 'answer', 'ice'], true) || !is_array($payload)) {
        json_response(['success' => false, 'message' => 'Invalid video signal'], 422);
    }

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
        'INSERT INTO chat_signals (room_token, sender_id, signal_type, signal_payload)
         VALUES (:room_token, :sender_id, :signal_type, :signal_payload)'
    );
    $stmt->execute([
        'room_token' => $roomToken,
        'sender_id' => $visitorId,
        'signal_type' => $signalType,
        'signal_payload' => json_encode($payload),
    ]);

    json_response(['success' => true, 'message' => 'Signal saved']);
});
