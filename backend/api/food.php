<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    $visitorId = clean_visitor_id($data);
    $selectedFood = clean_string($data, 'selected_food', 50);
    $allowedFoods = ['Pizza', 'Sushi', 'Burgers', 'Pasta', 'Tacos', 'Ramen'];

    if (!in_array($selectedFood, $allowedFoods, true)) {
        json_response(['success' => false, 'message' => 'Invalid food selection'], 422);
    }

    upsert_visitor($pdo, $visitorId);
    $stmt = $pdo->prepare(
        'UPDATE date_responses SET selected_food = :selected_food WHERE visitor_id = :visitor_id'
    );
    $stmt->execute([
        'selected_food' => $selectedFood,
        'visitor_id' => $visitorId,
    ]);

    json_response(['success' => true, 'message' => 'Food saved']);
});
