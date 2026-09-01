<?php
declare(strict_types=1);

class DatabaseConfigException extends RuntimeException
{
}

function load_env_file(string $path): void
{
    if (!is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\n\r\0\x0B\"'");

        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

function get_pdo(): PDO
{
    load_env_file(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env');

    $config = get_db_config();
    $host = $config['host'];
    $port = $config['port'];
    $database = $config['database'];
    $username = $config['username'];
    $password = $config['password'];

    if ($username !== 'root' && $password === '') {
        throw new DatabaseConfigException('Database password missing. Add DB_PASSWORD in the project .env file or hosting environment.');
    }

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $database);

    return new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function get_db_config(): array
{
    return [
        'host' => getenv('DB_HOST') ?: 'localhost',
        'port' => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: 'xrqnafrj_dating_invitation',
        'username' => getenv('DB_USERNAME') ?: 'xrqnafrj_sarthak_singhal',
        'password' => getenv('DB_PASSWORD') ?: 'Sarthak@2026#MySQL',
    ];
}
