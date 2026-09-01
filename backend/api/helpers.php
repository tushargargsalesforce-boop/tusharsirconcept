<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);

    if (!is_array($data)) {
        json_response(['success' => false, 'message' => 'Invalid JSON body'], 400);
    }

    return $data;
}

function require_post(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['success' => false, 'message' => 'Method not allowed'], 405);
    }
}

function clean_string(array $data, string $key, int $maxLength = 100): string
{
    $value = trim((string)($data[$key] ?? ''));

    if ($value === '' || strlen($value) > $maxLength) {
        json_response(['success' => false, 'message' => $key . ' is required'], 422);
    }

    return $value;
}

function clean_visitor_id(array $data): string
{
    $visitorId = clean_string($data, 'visitor_id', 100);

    if (!preg_match('/^dating_[a-zA-Z0-9]{8,40}$/', $visitorId)) {
        json_response(['success' => false, 'message' => 'Invalid visitor_id'], 422);
    }

    return $visitorId;
}

function upsert_visitor(PDO $pdo, string $visitorId): void
{
    $stmt = $pdo->prepare(
        'INSERT INTO date_responses (visitor_id) VALUES (:visitor_id)
         ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP'
    );
    $stmt->execute(['visitor_id' => $visitorId]);
}

function endpoint_guard(callable $handler): void
{
    require_post();

    try {
        $handler(get_pdo(), read_json_body());
    } catch (DatabaseConfigException $exception) {
        error_log($exception->getMessage());
        json_response(['success' => false, 'message' => $exception->getMessage()], 500);
    } catch (PDOException $exception) {
        error_log($exception->getMessage());
        json_response(['success' => false, 'message' => database_error_message($exception)], 500);
    } catch (Throwable $exception) {
        error_log($exception->getMessage());
        json_response(['success' => false, 'message' => 'Server error'], 500);
    }
}

function database_error_message(PDOException $exception): string
{
    $errorInfo = $exception->errorInfo;
    $mysqlCode = isset($errorInfo[1]) ? (int)$errorInfo[1] : 0;

    return match ($mysqlCode) {
        1044, 1045 => 'Database login failed. Check DB username, password and privileges.',
        1049 => 'Database name not found. Check DB_DATABASE.',
        1146 => 'Database table missing. Import database/schema.sql again.',
        2002, 2003 => 'Database host unavailable. Check DB_HOST and DB_PORT.',
        default => 'Database unavailable',
    };
}
