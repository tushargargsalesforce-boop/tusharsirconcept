<?php
declare(strict_types=1);

/**
 * Live nearby-place search.
 *
 * Location is controlled by the selected Country -> State -> District -> Town.
 * The frontend sends the selected town's GeoNames coordinates; Geoapify is then
 * queried around that town point and the nearest 5 matching places are returned.
 */

require_once __DIR__ . '/helpers.php';
load_env_file(dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env');

require_post();
$data = read_json_body();

$query = trim((string) ($data['query'] ?? ''));
$country = trim((string) ($data['country'] ?? ''));
$state = trim((string) ($data['state'] ?? ''));
$district = trim((string) ($data['district'] ?? ''));
$town = trim((string) ($data['town'] ?? ''));

$apiKey = trim((string) (
    getenv('GEOAPIFY_API_KEY')
    ?: ($_ENV['GEOAPIFY_API_KEY'] ?? '')
));

$latitude = filter_var($data['latitude'] ?? null, FILTER_VALIDATE_FLOAT);
$longitude = filter_var($data['longitude'] ?? null, FILTER_VALIDATE_FLOAT);

if ($query === '' || strlen($query) > 80) {
    json_response(['success' => false, 'message' => 'A search term is required'], 422);
}

foreach ([
    'country' => $country,
    'state' => $state,
    'district' => $district,
    'town' => $town,
] as $field => $value) {
    if ($value === '' || strlen($value) > 80) {
        json_response([
            'success' => false,
            'message' => 'Country, state, district, and town are required',
        ], 422);
    }
}

if (
    $latitude === false ||
    $longitude === false ||
    $latitude < -90 ||
    $latitude > 90 ||
    $longitude < -180 ||
    $longitude > 180
) {
    json_response(['success' => false, 'message' => 'Valid town coordinates are required'], 422);
}

if ($apiKey === '') {
    json_response([
        'success' => false,
        'message' => 'Geoapify API key is missing on the server',
    ], 500);
}

$term = preg_replace('/[^\p{L}\p{N} ._-]/u', ' ', $query) ?: '';
$term = trim($term);

if ($term === '') {
    json_response(['success' => false, 'message' => 'A valid search term is required'], 422);
}

$lat = number_format((float) $latitude, 6, '.', '');
$lng = number_format((float) $longitude, 6, '.', '');

$categories = categories_for_search($term);

$params = [
    'categories' => implode(',', $categories),
    // 10 km around the SELECTED TOWN, not the browser's current GPS position.
    'filter' => 'circle:' . $lng . ',' . $lat . ',10000',
    'bias' => 'proximity:' . $lng . ',' . $lat,
    'limit' => 50,
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

if (isset($decoded['error']) || isset($decoded['statusCode']) && (int) $decoded['statusCode'] >= 400) {
    $message = trim((string) ($decoded['message'] ?? 'Geoapify request failed'));
    json_response(['success' => false, 'message' => $message], 502);
}

$items = [];
$seen = [];
$searchTerms = search_terms_for($term);

foreach (($decoded['features'] ?? []) as $feature) {
    $properties = is_array($feature['properties'] ?? null)
        ? $feature['properties']
        : [];

    $name = trim((string) ($properties['name'] ?? $properties['address_line1'] ?? ''));
    $placeLatitude = isset($properties['lat']) ? (float) $properties['lat'] : 0.0;
    $placeLongitude = isset($properties['lon']) ? (float) $properties['lon'] : 0.0;

    if ($name === '' || !is_finite($placeLatitude) || !is_finite($placeLongitude)) {
        continue;
    }

    $key = strtolower($name . '|' . number_format($placeLatitude, 6, '.', '') . '|' . number_format($placeLongitude, 6, '.', ''));

    if (isset($seen[$key])) {
        continue;
    }
    $seen[$key] = true;

    $placeCategories = is_array($properties['categories'] ?? null)
        ? implode(' ', $properties['categories'])
        : (string) ($properties['categories'] ?? '');

    $haystack = strtolower(implode(' ', array_filter([
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

    /*
     * Category search is the primary filter. The text check is only used when
     * the user typed a specific name/word that is not simply a category term.
     */
    if (!matches_search($term, $searchTerms, $haystack, $placeCategories)) {
        continue;
    }

    $distance = distance_km(
        (float) $latitude,
        (float) $longitude,
        $placeLatitude,
        $placeLongitude
    );

    if ($distance > 10) {
        continue;
    }

    $items[] = [
        'name' => $name,
        'placeId' => (string) (
            $properties['place_id']
            ?? $properties['datasource']['raw']['id']
            ?? ''
        ),
        'description' => place_category_label($placeCategories),
        'detail' => trim((string) (
            $properties['formatted']
            ?? $properties['address_line2']
            ?? ($town . ', ' . $district . ', ' . $state . ', ' . $country)
        )),
        'distanceKm' => round($distance, 1),
        'lat' => $placeLatitude,
        'lng' => $placeLongitude,
        'town' => $town,
        'district' => $district,
        'state' => $state,
        'country' => $country,
    ];
}

usort(
    $items,
    static fn(array $first, array $second): int =>
        $first['distanceKm'] <=> $second['distanceKm']
);

json_response([
    'success' => true,
    'location' => [
        'country' => $country,
        'state' => $state,
        'district' => $district,
        'town' => $town,
        'latitude' => (float) $latitude,
        'longitude' => (float) $longitude,
        'radiusKm' => 10,
    ],
    'items' => array_slice($items, 0, 5),
]);

function distance_km(
    float $latOne,
    float $lngOne,
    float $latTwo,
    float $lngTwo
): float {
    $earthRadius = 6371.0;
    $latDelta = deg2rad($latTwo - $latOne);
    $lngDelta = deg2rad($lngTwo - $lngOne);

    $a = sin($latDelta / 2) ** 2
        + cos(deg2rad($latOne))
        * cos(deg2rad($latTwo))
        * sin($lngDelta / 2) ** 2;

    return $earthRadius * 2 * atan2(sqrt($a), sqrt(max(0.0, 1 - $a)));
}

function categories_for_search(string $term): array
{
    $term = strtolower(trim($term));

    /*
     * Only Geoapify Places categories used by this project are included here.
     * In particular, DO NOT use commercial.cafe.
     */
    $categoryMap = [
        'cafe' => ['catering.cafe'],
        'coffee' => ['catering.cafe'],
        'tea' => ['catering.cafe'],
        'bakery' => ['catering.bakery'],
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

    $categories = [];

    foreach ($categoryMap as $keyword => $mappedCategories) {
        if (str_contains($term, $keyword)) {
            $categories = array_merge($categories, $mappedCategories);
        }
    }

    if ($categories !== []) {
        return array_values(array_unique($categories));
    }

    // Broad fallback for a normal place-name search.
    return [
        'catering.cafe',
        'catering.restaurant',
        'catering.fast_food',
        'catering.bakery',
        'commercial.supermarket',
        'commercial.marketplace',
    ];
}

function search_terms_for(string $term): array
{
    $terms = preg_split('/\s+/', strtolower($term), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $terms = array_values(array_filter(
        $terms,
        static fn(string $value): bool => strlen($value) >= 3
    ));

    $synonyms = [
        'cafe' => ['cafe', 'coffee'],
        'coffee' => ['cafe', 'coffee'],
        'restaurant' => ['restaurant', 'food'],
        'bakery' => ['bakery', 'bread'],
        'pizza' => ['pizza'],
        'burger' => ['burger'],
        'tea' => ['tea', 'cafe'],
    ];

    foreach ($terms as $termPart) {
        if (isset($synonyms[$termPart])) {
            $terms = array_merge($terms, $synonyms[$termPart]);
        }
    }

    return array_values(array_unique($terms ?: [$term]));
}

function matches_search(
    string $term,
    array $searchTerms,
    string $haystack,
    string $placeCategories
): bool {
    $normalizedTerm = strtolower(trim($term));
    $normalizedCategories = strtolower($placeCategories);

    // Category terms are already enforced by Geoapify's categories parameter.
    $categoryTerms = [
        'cafe',
        'coffee',
        'tea',
        'bakery',
        'brunch',
        'restaurant',
        'food',
        'pizza',
        'burger',
        'fast food',
        'shop',
        'supermarket',
        'market',
    ];

    if (in_array($normalizedTerm, $categoryTerms, true)) {
        return true;
    }

    foreach ($searchTerms as $searchTerm) {
        if (stripos($haystack, $searchTerm) !== false) {
            return true;
        }
    }

    return $normalizedCategories !== '';
}

function place_category_label(string $categories): string
{
    $categories = strtolower($categories);

    if (str_contains($categories, 'bakery')) {
        return 'Bakery';
    }

    if (str_contains($categories, 'cafe')) {
        return 'Cafe';
    }

    if (str_contains($categories, 'fast_food')) {
        return 'Fast food';
    }

    if (str_contains($categories, 'restaurant')) {
        return 'Restaurant';
    }

    if (str_contains($categories, 'supermarket')) {
        return 'Supermarket';
    }

    if (str_contains($categories, 'marketplace')) {
        return 'Marketplace';
    }

    return 'Nearby place';
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
            CURLOPT_USERAGENT => 'talkifi-nearby-place-search/2.0',
        ]);

        $body = curl_exec($curl);

        if ($body === false) {
            error_log('Geoapify cURL failed: ' . curl_error($curl));
        }

        curl_close($curl);

        if ($body !== false && $body !== '') {
            return (string) $body;
        }
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 20,
            'ignore_errors' => true,
            'header' => "User-Agent: talkifi-nearby-place-search/2.0\r\n",
        ],
    ]);

    $body = file_get_contents($url, false, $context);

    return $body === false ? '' : (string) $body;
}
