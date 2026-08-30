<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $country = clean_string($data, 'country', 80);
    $state = clean_string($data, 'state', 80);
    $district = clean_string($data, 'district', 80);
    $town = clean_string($data, 'town', 80);
    $latitude = filter_var($data['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
    $longitude = filter_var($data['longitude'] ?? null, FILTER_VALIDATE_FLOAT);
    $radius = filter_var($data['search_radius_km'] ?? 10, FILTER_VALIDATE_INT);

    if ($latitude === false || $longitude === false || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
        json_response(['success' => false, 'message' => 'Invalid approximate location'], 422);
    }

    if ($radius !== 10) {
        json_response(['success' => false, 'message' => 'Search radius must be 10 km'], 422);
    }

    upsert_visitor($pdo, $visitorId);
    $stmt = $pdo->prepare(
        'UPDATE date_responses
         SET country = :country,
             state = :state,
             district = :district,
             town = :town,
             approximate_latitude = :latitude,
             approximate_longitude = :longitude,
             search_radius_km = 10
         WHERE visitor_id = :visitor_id'
    );
    $stmt->execute([
        'country' => $country,
        'state' => $state,
        'district' => $district,
        'town' => $town,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'visitor_id' => $visitorId,
    ]);

    json_response(['success' => true, 'message' => 'Approximate location saved']);
});
