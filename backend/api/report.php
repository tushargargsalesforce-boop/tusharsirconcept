<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $roomToken = clean_string($data, 'room_token', 80);
    $reason = clean_string($data, 'reason', 60);
    $detail = trim((string)($data['detail'] ?? ''));
    $allowedReasons = ['Harassment', 'Scam/Fraud', 'Sexual/Explicit Content', 'Threats', 'Hate/Abuse', 'Impersonation', 'Suspicious behavior', 'Other'];

    if (!in_array($reason, $allowedReasons, true) || strlen($detail) > 600) {
        json_response(['success' => false, 'message' => 'Invalid report details'], 422);
    }

    $partnerId = active_chat_partner($pdo, $visitorId, $roomToken);
    $statement = $pdo->prepare(
        'INSERT INTO user_reports (room_token, reporter_id, reported_id, reason, detail)
         VALUES (:room_token, :reporter_id, :reported_id, :reason, :detail)'
    );
    $statement->execute([
        'room_token' => $roomToken,
        'reporter_id' => $visitorId,
        'reported_id' => $partnerId,
        'reason' => $reason,
        'detail' => $detail === '' ? null : $detail,
    ]);
    json_response(['success' => true, 'message' => 'Report submitted']);
});
