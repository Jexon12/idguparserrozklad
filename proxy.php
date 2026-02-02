<?php
// proxy.php
// A simple proxy to forward requests to vnz.osvita.net to bypass CORS.

// Allow access from any origin (or restrict to your specific domain)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// Configuration
$baseUrl = 'http://vnz.osvita.net/WidgetSchedule.asmx/';
$targetUrl = '';

// Determine the target action
if (isset($_GET['action'])) {
    $action = $_GET['action'];
    // basic sanitization to allow only alphanumeric characters
    if (preg_match('/^[a-zA-Z0-9]+$/', $action)) {
        $targetUrl = $baseUrl . $action;
    } else {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        exit;
    }
    http_response_code(400);
    echo json_encode(['error' => 'Missing action parameter']);
    exit;
}

// --- Local Links Logic (CORS friendly) ---
if ($action === 'GetLinks') {
    $file = __DIR__ . '/data/links.json';
    if (!file_exists(__DIR__ . '/data')) { mkdir(__DIR__ . '/data', 0777, true); }
    
    if (file_exists($file)) {
        echo file_get_contents($file);
    } else {
        echo '{}';
    }
    exit;
}
if ($action === 'SaveLinks' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['password']) || $input['password'] !== 'admin123') {
        http_response_code(403);
        echo json_encode(['error' => 'Wrong password']);
        exit;
    }

    $file = __DIR__ . '/data/links.json';
    if (!file_exists(__DIR__ . '/data')) { mkdir(__DIR__ . '/data', 0777, true); }

    $links = [];
    if (file_exists($file)) {
        $links = json_decode(file_get_contents($file), true) ?? [];
    }

    if ($input['value'] === null) {
        unset($links[$input['key']]);
    } else {
        $links[$input['key']] = $input['value'];
    }

    if (file_put_contents($file, json_encode($links, JSON_PRETTY_PRINT))) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Write failed']);
    }
    exit;
}

// Construct the query string
$queryParams = $_GET;
unset($queryParams['action']); // Remove 'action' from the parameters sent to the remote API
$queryString = http_build_query($queryParams);

if ($queryString) {
    // The Osvita API expects parameters mostly as query strings even for some "POST" like behavior, 
    // but standard GET is what we observed in the analysis.
    $targetUrl .= '?' . $queryString;
}

// Initialize cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

// Add headers to mimic a browser to avoid being blocked
$headers = [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer: http://wp-fuaid.zzz.com.ua/', // The expected referer
    'Content-Type: application/json; charset=utf-8'
];
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

// Execute the request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => 'Curl error: ' . curl_error($ch)]);
} else {
    // Forward the API response
    http_response_code($httpCode);
    // The API wraps response in "d": { ... }. We return it as is.
    echo $response;
}

curl_close($ch);
?>
