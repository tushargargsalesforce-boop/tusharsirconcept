<?php
declare(strict_types=1);

// DEBUG MODE
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

echo json_encode([
    'step' => 1,
    'message' => 'PHP is running'
], JSON_PRETTY_PRINT);

require_once __DIR__ . '/helpers.php';

echo json_encode([
    'step' => 2,
    'message' => 'helpers.php loaded'
], JSON_PRETTY_PRINT);

try {

    echo json_encode([
        'step' => 3,
        'message' => 'Loading environment'
    ], JSON_PRETTY_PRINT);

    load_env_file(
        dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env'
    );

    $config = get_db_config();

    echo json_encode([
        'step' => 4,
        'message' => 'Config loaded',
        'host' => $config['host'],
        'port' => $config['port'],
        'database' => $config['database'],
        'username' => $config['username'],
        'password_set' => $config['password'] !== ''
    ], JSON_PRETTY_PRINT);

    echo json_encode([
        'step' => 5,
        'message' => 'Trying database connection'
    ], JSON_PRETTY_PRINT);

    $pdo = get_pdo();

    echo json_encode([
        'step' => 6,
        'message' => 'DATABASE CONNECTION SUCCESS'
    ], JSON_PRETTY_PRINT);

    $tables = $pdo
        ->query('SHOW TABLES')
        ->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode([
        'step' => 7,
        'message' => 'Tables loaded',
        'tables' => $tables
    ], JSON_PRETTY_PRINT);

    $requiredTables = [
        'date_responses',
        'chat_rooms',
        'chat_messages',
        'chat_signals',
        'online_users'
    ];

    $missingTables = array_values(
        array_diff($requiredTables, $tables)
    );

    $chatColumns = [];

    if (in_array('chat_rooms', $tables, true)) {
        $chatColumns = $pdo
            ->query('SHOW COLUMNS FROM chat_rooms')
            ->fetchAll(PDO::FETCH_COLUMN);
    }

    echo json_encode([
        'step' => 8,
        'message' => 'Database check completed',
        'database' => $config['database'],
        'username' => $config['username'],
        'password_set' => $config['password'] !== '',
        'missing_tables' => $missingTables,
        'chat_mode_column' => in_array(
            'chat_mode',
            $chatColumns,
            true
        )
    ], JSON_PRETTY_PRINT);

} catch (DatabaseConfigException $exception) {

    echo json_encode([
        'success' => false,
        'error_type' => 'DatabaseConfigException',
        'message' => $exception->getMessage(),
        'file' => $exception->getFile(),
        'line' => $exception->getLine()
    ], JSON_PRETTY_PRINT);

} catch (PDOException $exception) {

    echo json_encode([
        'success' => false,
        'error_type' => 'PDOException',
        'message' => $exception->getMessage(),
        'error_info' => $exception->errorInfo,
        'file' => $exception->getFile(),
        'line' => $exception->getLine()
    ], JSON_PRETTY_PRINT);

} catch (Throwable $exception) {

    echo json_encode([
        'success' => false,
        'error_type' => get_class($exception),
        'message' => $exception->getMessage(),
        'file' => $exception->getFile(),
        'line' => $exception->getLine()
    ], JSON_PRETTY_PRINT);
}