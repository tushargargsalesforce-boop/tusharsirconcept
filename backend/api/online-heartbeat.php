<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $country = isset($data['country']) && trim((string)$data['country']) !== '' ? trim((string)$data['country']) : null;
    $state = isset($data['state']) && trim((string)$data['state']) !== '' ? trim((string)$data['state']) : null;
    $district = isset($data['district']) && trim((string)$data['district']) !== '' ? trim((string)$data['district']) : null;
    $town = isset($data['town']) && trim((string)$data['town']) !== '' ? trim((string)$data['town']) : null;

    $stmt = $pdo->prepare(
        'INSERT INTO online_users (visitor_id, country, state, district, town, last_seen)
         VALUES (:visitor_id, :country, :state, :district, :town, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           country = COALESCE(VALUES(country), country),
           state = COALESCE(VALUES(state), state),
           district = COALESCE(VALUES(district), district),
           town = COALESCE(VALUES(town), town),
           last_seen = CURRENT_TIMESTAMP'
    );
    $stmt->execute([
        'visitor_id' => $visitorId,
        'country' => $country,
        'state' => $state,
        'district' => $district,
        'town' => $town,
    ]);

    json_response(['success' => true, 'message' => 'Online status updated']);
});
