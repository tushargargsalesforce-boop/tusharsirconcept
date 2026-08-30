<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $selectedDate = clean_string($data, 'selected_date', 10);
    $selectedTime = clean_string($data, 'selected_time', 5);
    $allowedTimes = ['17:00', '18:00', '19:00', '20:00'];

    $date = DateTime::createFromFormat('Y-m-d', $selectedDate);
    if (!$date || $date->format('Y-m-d') !== $selectedDate) {
        json_response(['success' => false, 'message' => 'Invalid date'], 422);
    }

    if (!in_array($selectedTime, $allowedTimes, true)) {
        json_response(['success' => false, 'message' => 'Invalid time'], 422);
    }

    upsert_visitor($pdo, $visitorId);
    $stmt = $pdo->prepare(
        'UPDATE date_responses
         SET selected_date = :selected_date, selected_time = :selected_time
         WHERE visitor_id = :visitor_id'
    );
    $stmt->execute([
        'selected_date' => $selectedDate,
        'selected_time' => $selectedTime,
        'visitor_id' => $visitorId,
    ]);

    json_response(['success' => true, 'message' => 'Date saved']);
});
