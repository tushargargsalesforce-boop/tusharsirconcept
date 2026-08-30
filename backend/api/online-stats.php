<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

endpoint_guard(function (PDO $pdo, array $data): void {
    clean_visitor_id($data);

    $totalStmt = $pdo->query(
        "SELECT COUNT(*) AS total
         FROM online_users
         WHERE last_seen > (NOW() - INTERVAL 2 MINUTE)"
    );
    $total = (int)$totalStmt->fetch()['total'];

    $countryStmt = $pdo->query(
        "SELECT COALESCE(country, 'Unknown') AS label, COUNT(*) AS total
         FROM online_users
         WHERE last_seen > (NOW() - INTERVAL 2 MINUTE)
         GROUP BY COALESCE(country, 'Unknown')
         ORDER BY total DESC, label ASC
         LIMIT 20"
    );

    $stateStmt = $pdo->query(
        "SELECT COALESCE(country, 'Unknown') AS country,
                COALESCE(state, 'Unknown') AS state,
                COUNT(*) AS total
         FROM online_users
         WHERE last_seen > (NOW() - INTERVAL 2 MINUTE)
         GROUP BY COALESCE(country, 'Unknown'), COALESCE(state, 'Unknown')
         ORDER BY total DESC, country ASC, state ASC
         LIMIT 40"
    );

    json_response([
        'success' => true,
        'total_online' => $total,
        'countries' => $countryStmt->fetchAll(),
        'states' => $stateStmt->fetchAll(),
    ]);
});
