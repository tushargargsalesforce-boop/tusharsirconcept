<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

try {
    load_env_file(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env');
    $config = get_db_config();
    $pdo = get_pdo();
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $requiredTables = ['date_responses', 'chat_rooms', 'chat_messages', 'chat_signals', 'online_users'];
    $missingTables = array_values(array_diff($requiredTables, $tables));
    $chatColumns = [];

    if (!in_array('chat_rooms', $missingTables, true)) {
        $chatColumns = $pdo->query('SHOW COLUMNS FROM chat_rooms')->fetchAll(PDO::FETCH_COLUMN);
    }

    json_response([
        'success' => true,
        'message' => 'Database connection ok',
        'database' => $config['database'],
        'username' => $config['username'],
        'password_set' => $config['password'] !== '',
        'tables' => $tables,
        'missing_tables' => $missingTables,
        'chat_mode_column' => in_array('chat_mode', $chatColumns, true),
    ]);
} catch (DatabaseConfigException $exception) {
    json_response([
        'success' => false,
        'message' => $exception->getMessage(),
    ], 500);
} catch (PDOException $exception) {
    error_log($exception->getMessage());
    json_response([
        'success' => false,
        'message' => database_error_message($exception),
    ], 500);
}
