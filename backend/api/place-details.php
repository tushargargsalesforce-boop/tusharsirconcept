<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
load_env_file(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env');

require_post();
$data = read_json_body();
$placeId = trim((string)($data['place_id'] ?? ''));
$apiKey = trim((string)(getenv('GEOAPIFY_API_KEY') ?: ''));

if ($placeId === '' || strlen($placeId) > 500) {
    json_response(['success' => false, 'message' => 'A valid place is required'], 422);
}

if ($apiKey === '') {
    json_response(['success' => false, 'message' => 'Geoapify API key is missing on the server'], 500);
}

$url = 'https://api.geoapify.com/v2/place-details?' . http_build_query([
    'id' => $placeId,
    'apiKey' => $apiKey,
]);
$body = geoapify_details_request($url);
if ($body === '') {
    json_response(['success' => false, 'message' => 'Place details are temporarily unavailable'], 502);
}

$decoded = json_decode($body, true);
$properties = $decoded['features'][0]['properties'] ?? $decoded['properties'] ?? null;
if (!is_array($properties)) {
    json_response(['success' => false, 'message' => 'No details found for this place'], 404);
}

json_response([
    'success' => true,
    'details' => [
        'name' => $properties['name'] ?? $properties['address_line1'] ?? 'Selected place',
        'address' => $properties['formatted'] ?? trim(($properties['address_line1'] ?? '') . ', ' . ($properties['address_line2'] ?? '')),
        'phone' => $properties['contact']['phone'] ?? $properties['phone'] ?? '',
        'website' => $properties['contact']['website'] ?? $properties['website'] ?? '',
        'openingHours' => $properties['opening_hours'] ?? '',
    ],
]);

function geoapify_details_request(string $url): string
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'talkifi-place-details/1.0',
        ]);
        $body = curl_exec($curl);
        curl_close($curl);
        if ($body !== false && $body !== '') return (string)$body;
    }

    $context = stream_context_create(['http' => [
        'method' => 'GET',
        'timeout' => 20,
        'ignore_errors' => true,
        'header' => "User-Agent: talkifi-place-details/1.0\r\n",
    ]]);
    $body = file_get_contents($url, false, $context);
    return $body === false ? '' : (string)$body;
}
