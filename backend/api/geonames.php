<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

require_post();
$data = read_json_body();
$username = trim((string)(getenv('GEONAMES_USERNAME') ?: ''));

load_env_file(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env');
$username = trim((string)(getenv('GEONAMES_USERNAME') ?: $username));

if ($username === '') {
    json_response([
        'success' => false,
        'message' => 'GeoNames username missing. Add GEONAMES_USERNAME in .env.',
    ], 500);
}

$action = trim((string)($data['action'] ?? ''));

if ($action === 'countries') {
    $response = geonames_request('countryInfoJSON', [
        'lang' => 'en',
        'username' => $username,
    ]);

    $countries = array_map(static function (array $row): array {
        return [
            'name' => (string)($row['countryName'] ?? ''),
            'geonameId' => (int)($row['geonameId'] ?? 0),
            'countryCode' => (string)($row['countryCode'] ?? ''),
            'lat' => isset($row['north'], $row['south']) ? (((float)$row['north'] + (float)$row['south']) / 2) : null,
            'lng' => isset($row['east'], $row['west']) ? (((float)$row['east'] + (float)$row['west']) / 2) : null,
        ];
    }, $response['geonames'] ?? []);

    json_response(['success' => true, 'items' => sort_geonames($countries)]);
}

if ($action === 'children') {
    $geonameId = filter_var($data['geoname_id'] ?? null, FILTER_VALIDATE_INT);

    if ($geonameId === false || $geonameId <= 0) {
        json_response(['success' => false, 'message' => 'Valid geoname_id is required'], 422);
    }

    $response = geonames_request('childrenJSON', [
        'geonameId' => $geonameId,
        'maxRows' => 1000,
        'lang' => 'en',
        'username' => $username,
    ]);

    $items = array_map(static function (array $row): array {
        return [
            'name' => (string)($row['name'] ?? ''),
            'geonameId' => (int)($row['geonameId'] ?? 0),
            'countryCode' => (string)($row['countryCode'] ?? ''),
            'adminCode1' => (string)($row['adminCode1'] ?? ''),
            'adminCode2' => (string)($row['adminCode2'] ?? ''),
            'featureClass' => (string)($row['fcl'] ?? ''),
            'featureCode' => (string)($row['fcode'] ?? ''),
            'lat' => isset($row['lat']) ? (float)$row['lat'] : null,
            'lng' => isset($row['lng']) ? (float)$row['lng'] : null,
        ];
    }, $response['geonames'] ?? []);

    json_response(['success' => true, 'items' => sort_geonames($items)]);
}

if ($action === 'cities') {
    $countryCode = strtoupper(trim((string)($data['country_code'] ?? '')));
    $adminCode1 = trim((string)($data['admin_code_1'] ?? ''));
    $adminCode2 = trim((string)($data['admin_code_2'] ?? ''));

    if (!preg_match('/^[A-Z]{2}$/', $countryCode)) {
        json_response(['success' => false, 'message' => 'Valid country_code is required'], 422);
    }

    $params = [
        'q' => '',
        'country' => $countryCode,
        'featureClass' => 'P',
        'maxRows' => 1000,
        'orderby' => 'population',
        'lang' => 'en',
        'type' => 'json',
        'username' => $username,
    ];

    if ($adminCode1 !== '') {
        $params['adminCode1'] = $adminCode1;
    }

    if ($adminCode2 !== '') {
        $params['adminCode2'] = $adminCode2;
    }

    $response = geonames_request('searchJSON', $params);
    $items = array_map(static function (array $row): array {
        return [
            'name' => (string)($row['name'] ?? $row['toponymName'] ?? ''),
            'geonameId' => (int)($row['geonameId'] ?? 0),
            'countryCode' => (string)($row['countryCode'] ?? ''),
            'adminCode1' => (string)($row['adminCode1'] ?? ''),
            'adminCode2' => (string)($row['adminCode2'] ?? ''),
            'featureClass' => (string)($row['fcl'] ?? ''),
            'featureCode' => (string)($row['fcode'] ?? ''),
            'lat' => isset($row['lat']) ? (float)$row['lat'] : null,
            'lng' => isset($row['lng']) ? (float)$row['lng'] : null,
        ];
    }, $response['geonames'] ?? []);

    json_response(['success' => true, 'items' => sort_geonames($items)]);
}

json_response(['success' => false, 'message' => 'Invalid GeoNames action'], 422);

function geonames_request(string $service, array $params): array
{
    $url = 'http://api.geonames.org/' . $service . '?' . http_build_query($params);
    $body = http_get($url);

    if ($body === '') {
        json_response(['success' => false, 'message' => 'GeoNames request failed'], 502);
    }

    $decoded = json_decode($body, true);

    if (!is_array($decoded)) {
        json_response(['success' => false, 'message' => 'GeoNames returned invalid JSON'], 502);
    }

    if (isset($decoded['status']['message'])) {
        json_response(['success' => false, 'message' => 'GeoNames: ' . $decoded['status']['message']], 502);
    }

    return $decoded;
}

function http_get(string $url): string
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);

        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'dating-invitation-geonames/1.0',
        ]);

        $body = curl_exec($curl);
        $error = curl_error($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);

        if ($body === false) {
            error_log('GeoNames cURL failed: ' . ($error !== '' ? $error : 'HTTP ' . $status));
            return '';
        }

        return (string)$body;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 15,
            'ignore_errors' => true,
        ],
    ]);
    $body = file_get_contents($url, false, $context);

    if ($body === false) {
        error_log('GeoNames file_get_contents failed.');
        return '';
    }

    return (string)$body;
}

function sort_geonames(array $items): array
{
    $items = array_values(array_filter($items, static fn (array $item): bool => $item['name'] !== '' && $item['geonameId'] > 0));

    usort($items, static fn (array $a, array $b): int => strcasecmp($a['name'], $b['name']));

    return $items;
}
