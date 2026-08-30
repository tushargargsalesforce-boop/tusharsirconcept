<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);

    $currentStmt = $pdo->prepare(
        'SELECT approximate_latitude, approximate_longitude
         FROM date_responses
         WHERE visitor_id = :visitor_id'
    );
    $currentStmt->execute(['visitor_id' => $visitorId]);
    $current = $currentStmt->fetch();

    if (!$current || $current['approximate_latitude'] === null || $current['approximate_longitude'] === null) {
        json_response(['success' => false, 'message' => 'Save your location first'], 422);
    }

    $lat = (float)$current['approximate_latitude'];
    $lng = (float)$current['approximate_longitude'];

    $stmt = $pdo->prepare(
        'SELECT visitor_id,
                district,
                town,
                selected_food,
                selected_time,
                ROUND(
                    6371 * ACOS(LEAST(1, GREATEST(-1,
                        COS(RADIANS(:lat_one)) *
                        COS(RADIANS(approximate_latitude)) *
                        COS(RADIANS(approximate_longitude) - RADIANS(:lng_one)) +
                        SIN(RADIANS(:lat_two)) *
                        SIN(RADIANS(approximate_latitude))
                    ))),
                    1
                ) AS distance_km
         FROM date_responses
         WHERE visitor_id <> :visitor_id
           AND final_accepted = TRUE
           AND approximate_latitude IS NOT NULL
           AND approximate_longitude IS NOT NULL
         HAVING distance_km <= 10
         ORDER BY distance_km ASC
         LIMIT 12'
    );
    $stmt->execute([
        'lat_one' => $lat,
        'lng_one' => $lng,
        'lat_two' => $lat,
        'visitor_id' => $visitorId,
    ]);

    $matches = array_map(static function (array $row): array {
        return [
            'label' => 'Accepted profile ' . substr((string)$row['visitor_id'], -4),
            'district' => $row['district'] ?: 'private district',
            'town' => $row['town'] ?: 'nearby area',
            'selected_food' => $row['selected_food'],
            'selected_time' => $row['selected_time'],
            'distance_km' => (float)$row['distance_km'],
        ];
    }, $stmt->fetchAll());

    json_response(['success' => true, 'matches' => $matches]);
});
