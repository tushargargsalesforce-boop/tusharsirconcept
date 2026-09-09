<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

require_post();
$data = read_json_body();
$query = trim((string)($data['query'] ?? ''));
$latitude = filter_var($data['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
$longitude = filter_var($data['longitude'] ?? null, FILTER_VALIDATE_FLOAT);

if ($query === '' || strlen($query) > 80) {
    json_response(['success' => false, 'message' => 'A search term is required'], 422);
}

if ($latitude === false || $longitude === false || $latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
    json_response(['success' => false, 'message' => 'Valid coordinates are required'], 422);
}

$term = preg_replace('/[^\p{L}\p{N} ._-]/u', ' ', $query) ?: '';
$term = trim($term);
if ($term === '') {
    json_response(['success' => false, 'message' => 'A valid search term is required'], 422);
}

$lat = number_format((float)$latitude, 6, '.', '');
$lng = number_format((float)$longitude, 6, '.', '');
$searchTerms = [strtolower($term)];
foreach ([
    'coffee' => ['cafe', 'coffee'],
    'cafe' => ['cafe', 'coffee'],
    'bakery' => ['bakery', 'bread', 'pastry'],
    'pizza' => ['pizza', 'italian'],
    'burger' => ['burger', 'hamburger'],
    'breakfast' => ['breakfast', 'brunch'],
    'brunch' => ['breakfast', 'brunch'],
] as $keyword => $relatedTerms) {
    if (stripos(strtolower($term), $keyword) !== false) {
        $searchTerms = array_merge($searchTerms, $relatedTerms);
    }
}
$overpassQuery = '[out:json][timeout:12];'
    . 'nwr(around:10000,' . $lat . ',' . $lng . ')'
    . '[amenity~"cafe|restaurant|fast_food|bar|food_court|bakery",i];'
    . 'out center tags;';

$body = overpass_request($overpassQuery);
if ($body === '') {
    json_response(['success' => false, 'message' => 'Map search is temporarily unavailable'], 502);
}

$decoded = json_decode($body, true);
if (!is_array($decoded)) {
    json_response(['success' => false, 'message' => 'Map search returned invalid data'], 502);
}

$items = [];
$seen = [];
foreach (($decoded['elements'] ?? []) as $element) {
    $tags = $element['tags'] ?? [];
    $name = trim((string)($tags['name'] ?? ''));
    $placeLatitude = isset($element['lat']) ? (float)$element['lat'] : (float)($element['center']['lat'] ?? 0);
    $placeLongitude = isset($element['lon']) ? (float)$element['lon'] : (float)($element['center']['lon'] ?? 0);
    if ($name === '' || !$placeLatitude || !$placeLongitude) continue;

    $key = strtolower($name . '|' . $placeLatitude . '|' . $placeLongitude);
    if (isset($seen[$key])) continue;
    $seen[$key] = true;

    $amenity = trim((string)($tags['amenity'] ?? 'cafe'));
    $cuisine = trim((string)($tags['cuisine'] ?? ''));
    $searchHaystack = strtolower($name . ' ' . $amenity . ' ' . $cuisine);
    $matchesSearch = false;
    foreach ($searchTerms as $searchTerm) {
        if (stripos($searchHaystack, $searchTerm) !== false) {
            $matchesSearch = true;
            break;
        }
    }
    if (!$matchesSearch) continue;
    $distance = distance_km((float)$latitude, (float)$longitude, $placeLatitude, $placeLongitude);
    if ($distance > 10) continue;

    $items[] = [
        'name' => $name,
        'description' => ucfirst(str_replace('_', ' ', $amenity)),
        'detail' => 'Found on the nearby map',
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

function overpass_request(string $query): string
{
    $url = 'https://overpass-api.de/api/interpreter';
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['data' => $query]),
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'talkifi-nearby-place-search/1.0',
        ]);
        $body = curl_exec($curl);
        curl_close($curl);
        return $body === false ? '' : (string)$body;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query(['data' => $query]),
            'timeout' => 15,
        ],
    ]);
    $body = file_get_contents($url, false, $context);
    return $body === false ? '' : (string)$body;
}
