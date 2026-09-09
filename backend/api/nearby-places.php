<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
load_env_file(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env');

require_post();
$data = read_json_body();
$query = trim((string)($data['query'] ?? ''));
$apiKey = trim((string)(getenv('GEOAPIFY_API_KEY') ?: ''));
$latitude = filter_var($data['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
$longitude = filter_var($data['longitude'] ?? null, FILTER_VALIDATE_FLOAT);

if ($query === '' || strlen($query) > 80) {
    json_response(['success' => false, 'message' => 'A search term is required'], 422);
}

if ($latitude === false || $longitude === false || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
    json_response(['success' => false, 'message' => 'Valid coordinates are required'], 422);
}

if ($apiKey === '') {
    json_response(['success' => false, 'message' => 'Geoapify API key is missing on the server'], 500);
}

$term = preg_replace('/[^\p{L}\p{N} ._-]/u', ' ', $query) ?: '';
$term = trim($term);
if ($term === '') {
    json_response(['success' => false, 'message' => 'A valid search term is required'], 422);
}

$lat = number_format((float)$latitude, 6, '.', '');
$lng = number_format((float)$longitude, 6, '.', '');
$categories = categories_for_search($term);
$params = [
    'categories' => implode(',', $categories),
    'filter' => 'circle:' . $lng . ',' . $lat . ',10000',
    'bias' => 'proximity:' . $lng . ',' . $lat,
    'limit' => 20,
    'apiKey' => $apiKey,
];
$body = geoapify_request($params);
if ($body === '') {
    json_response(['success' => false, 'message' => 'Map search is temporarily unavailable'], 502);
}

$decoded = json_decode($body, true);
if (!is_array($decoded)) {
    json_response(['success' => false, 'message' => 'Map search returned invalid data'], 502);
}

$items = [];
$seen = [];
foreach (($decoded['features'] ?? []) as $feature) {
    $properties = $feature['properties'] ?? [];
    $name = trim((string)($properties['name'] ?? $properties['address_line1'] ?? ''));
    $placeLatitude = (float)($properties['lat'] ?? 0);
    $placeLongitude = (float)($properties['lon'] ?? 0);
    if ($name === '' || !$placeLatitude || !$placeLongitude) continue;

    $key = strtolower($name . '|' . $placeLatitude . '|' . $placeLongitude);
    if (isset($seen[$key])) continue;
    $seen[$key] = true;

    $placeCategories = is_array($properties['categories'] ?? null)
        ? implode(' ', $properties['categories'])
        : (string)($properties['categories'] ?? '');
    $searchHaystack = strtolower(implode(' ', array_filter([
        $name,
        $placeCategories,
        $properties['address_line1'] ?? '',
        $properties['address_line2'] ?? '',
        $properties['street'] ?? '',
        $properties['city'] ?? '',
        $properties['district'] ?? '',
        $properties['state'] ?? '',
        $properties['country'] ?? '',
        $properties['suburb'] ?? '',
    ])));
    $searchTerms = search_terms_for($term);
    $matchesSearch = false;
    foreach ($searchTerms as $searchTerm) {
        if (stripos($searchHaystack, $searchTerm) !== false) {
            $matchesSearch = true;
            break;
        }
    }
    if (!$matchesSearch) continue;
    $category = place_category_label($placeCategories);
    $distance = distance_km((float)$latitude, (float)$longitude, $placeLatitude, $placeLongitude);
    if ($distance > 10) continue;

    $items[] = [
        'name' => $name,
        'placeId' => (string)($properties['place_id'] ?? $properties['datasource']['raw']['id'] ?? ''),
        'description' => $category,
        'detail' => trim((string)($properties['formatted'] ?? $properties['address_line2'] ?? $properties['city'] ?? 'Found on Geoapify map')),
        'distanceKm' => round($distance, 1),
        'lat' => $placeLatitude,
        'lng' => $placeLongitude,
    ];
}

usort($items, static fn(array $first, array $second): int => $first['distanceKm'] <=> $second['distanceKm']);
json_response(['success' => true, 'items' => array_slice($items, 0, 5)]);

function distance_km(float $latOne, float $lngOne, float $latTwo, float $lngTwo): float
{
    $earthRadius = 6371;
    $latDelta = deg2rad($latTwo - $latOne);
    $lngDelta = deg2rad($lngTwo - $lngOne);
    $a = sin($latDelta / 2) ** 2
        + cos(deg2rad($latOne)) * cos(deg2rad($latTwo)) * sin($lngDelta / 2) ** 2;
    return $earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

function categories_for_search(string $term): array
{
    $term = strtolower($term);
    $categories = [];

    $categoryMap = [
        'cafe' => ['catering.cafe'],
        'coffee' => ['catering.cafe'],
        'tea' => ['catering.cafe'],
        'bakery' => ['commercial.food_and_drink'],
        'brunch' => ['catering.restaurant'],
        'restaurant' => ['catering.restaurant'],
        'food' => ['catering.restaurant', 'catering.fast_food'],
        'pizza' => ['catering.restaurant', 'catering.fast_food'],
        'burger' => ['catering.fast_food'],
        'fast food' => ['catering.fast_food'],
        'shop' => ['commercial.supermarket', 'commercial.marketplace'],
        'supermarket' => ['commercial.supermarket'],
        'market' => ['commercial.supermarket', 'commercial.marketplace'],
    ];

    foreach ($categoryMap as $keyword => $mappedCategories) {
        if (str_contains($term, $keyword)) {
            $categories = array_merge($categories, $mappedCategories);
        }
    }

    return array_values(array_unique($categories ?: [
        'catering.cafe',
        'catering.restaurant',
        'catering.fast_food',
        'commercial.food_and_drink',
        'commercial.supermarket',
        'commercial.marketplace',
    ]));
}

function search_terms_for(string $term): array
{
    $terms = preg_split('/\s+/', strtolower($term), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $terms = array_values(array_filter($terms, static fn(string $value): bool => strlen($value) >= 3));

    $synonyms = [
        'cafe' => ['cafe', 'coffee'],
        'coffee' => ['cafe', 'coffee'],
        'restaurant' => ['restaurant', 'food'],
        'bakery' => ['bakery', 'bread'],
        'pizza' => ['pizza'],
        'burger' => ['burger'],
    ];

    foreach ($terms as $termPart) {
        if (isset($synonyms[$termPart])) {
            $terms = array_merge($terms, $synonyms[$termPart]);
        }
    }

    return array_values(array_unique($terms ?: [$term]));
}

function place_category_label(string $categories): string
{
    $categories = strtolower($categories);
    return str_contains($categories, 'bakery') || str_contains($categories, 'food_and_drink')
        ? 'Bakery or food shop'
        : (str_contains($categories, 'cafe') ? 'Cafe' : (str_contains($categories, 'restaurant') ? 'Restaurant' : 'Nearby place'));
}

function geoapify_request(array $params): string
{
    $url = 'https://api.geoapify.com/v2/places?' . http_build_query($params);
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'talkifi-nearby-place-search/1.0',
        ]);
        $body = curl_exec($curl);
        if ($body === false) {
            error_log('Geoapify cURL failed: ' . curl_error($curl));
        }
        curl_close($curl);
        if ($body !== false && $body !== '') {
            return (string)$body;
        }
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 20,
            'ignore_errors' => true,
            'header' => "User-Agent: talkifi-nearby-place-search/1.0\r\n",
        ],
    ]);
    $body = file_get_contents($url, false, $context);
    return $body === false ? '' : (string)$body;
}
