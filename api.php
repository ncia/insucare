<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}

$host = "localhost";
$dbname = "nciame_care";
$username = "nciame_care";
$password = "V?nPPYwGOscw=dIm";

try {
    $conn = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 테이블이 없으면 자동 생성
    $createTableQuery = "
        CREATE TABLE IF NOT EXISTS simple_consult (
            id INT AUTO_INCREMENT PRIMARY KEY,
            path VARCHAR(50) NOT NULL,
            name VARCHAR(50) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            birthdate VARCHAR(10) NOT NULL,
            gender VARCHAR(10) NOT NULL,
            province VARCHAR(50),
            district VARCHAR(50),
            claim_reason VARCHAR(255),
            hospital_name VARCHAR(100),
            current_premium VARCHAR(100),
            target_coverage VARCHAR(255),
            concern_point VARCHAR(255),
            check_request VARCHAR(255),
            analysis_interest VARCHAR(255),
            analysis_company VARCHAR(255),
            term_privacy TINYINT(1) DEFAULT 0,
            term_marketing TINYINT(1) DEFAULT 0,
            consult_time_type VARCHAR(20),
            consult_time VARCHAR(20),
            status VARCHAR(20) DEFAULT '대기중',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $conn->exec($createTableQuery);

    $json = file_get_contents('php://input');
    $data = json_decode($json, true);

    if ($data) {
        $inquiry_type = $data['inquiry_type'] ?? '';
        $path = '';
        if ($inquiry_type === 'item1') $path = '보험분석 상담';
        else if ($inquiry_type === 'item2') $path = '보험 리모델링';
        else if ($inquiry_type === 'item3') $path = '보험금 청구';
        else if ($inquiry_type === 'item4') $path = '내보험 점검';
        else $path = '기타';

        if (isset($data['gender'])) {
            if ($data['gender'] === 'male') $data['gender'] = '남성';
            else if ($data['gender'] === 'female') $data['gender'] = '여성';
        }


        $stmt = $conn->prepare("
            INSERT INTO simple_consult (
                path, name, phone, birthdate, gender, province, district,
                claim_reason, hospital_name, current_premium, target_coverage, concern_point, check_request,
                analysis_interest, analysis_company, term_privacy, term_marketing, consult_time_type, consult_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $path,
            $data['name'] ?? '',
            $data['phone'] ?? '',
            $data['birthdate'] ?? '',
            $data['gender'] ?? '',
            $data['province'] ?? '',
            $data['district'] ?? '',
            $data['claim_reason'] ?? null,
            $data['hospital_name'] ?? null,
            $data['current_premium'] ?? null,
            $data['target_coverage'] ?? null,
            $data['concern_point'] ?? null,
            $data['check_request'] ?? null,
            $data['analysis_interest'] ?? null,
            $data['analysis_company'] ?? null,
            isset($data['term_privacy']) && $data['term_privacy'] ? 1 : 0,
            isset($data['term_marketing']) && $data['term_marketing'] ? 1 : 0,
            $data['consult_time_type'] ?? null,
            $data['consult_time'] ?? null
        ]);
        
        // 구글 시트 연동 로직 시작
        try {
            if (file_exists(__DIR__ . '/google_key.php')) {
                $keyData = require __DIR__ . '/google_key.php';
                
                $header = json_encode(['alg' => 'RS256', 'typ' => 'JWT']);
                $now = time();
                $claim = json_encode([
                    'iss' => $keyData['client_email'],
                    'scope' => 'https://www.googleapis.com/auth/spreadsheets',
                    'aud' => 'https://oauth2.googleapis.com/token',
                    'exp' => $now + 3600,
                    'iat' => $now
                ]);

                $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
                $base64UrlClaim = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($claim));

                $signature = '';
                openssl_sign($base64UrlHeader . '.' . $base64UrlClaim, $signature, $keyData['private_key'], 'SHA256');
                $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

                $jwt = $base64UrlHeader . '.' . $base64UrlClaim . '.' . $base64UrlSignature;

                $ch = curl_init('https://oauth2.googleapis.com/token');
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
                    'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    'assertion' => $jwt
                ]));
                
                $response = curl_exec($ch);
                curl_close($ch);
                
                $result = json_decode($response, true);
                $accessToken = $result['access_token'] ?? null;

                if ($accessToken) {
                    $spreadsheetId = '1t3OElFyO6HlUm7qtf8ASE5PTEk5qAq6IzALsaV4XSA0';
                    $baseRange = '간편상담CARE';
                    $range = $baseRange;

                    // 구글 시트 탭 이름 동적 매칭 (🔴 이모지 유무에 상관없이 매칭)
                    $metaUrl = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}?fields=sheets.properties.title";
                    $chMeta = curl_init($metaUrl);
                    curl_setopt($chMeta, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($chMeta, CURLOPT_HTTPHEADER, [
                        'Authorization: Bearer ' . $accessToken,
                        'Content-Type: application/json'
                    ]);
                    $metaResponse = curl_exec($chMeta);
                    curl_close($chMeta);

                    if ($metaResponse) {
                        $metaData = json_decode($metaResponse, true);
                        if (!empty($metaData['sheets'])) {
                            $cleanBase = preg_replace('/[^\p{L}\p{N}]/u', '', $baseRange);
                            foreach ($metaData['sheets'] as $s) {
                                $sheetTitle = $s['properties']['title'] ?? '';
                                $cleanTitle = preg_replace('/[^\p{L}\p{N}]/u', '', $sheetTitle);
                                if ($sheetTitle === $baseRange || $cleanTitle === $cleanBase || mb_strpos($sheetTitle, $baseRange) !== false) {
                                    $range = $sheetTitle;
                                    break;
                                }
                            }
                        }
                    }

                    $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/" . urlencode($range) . ":append?valueInputOption=USER_ENTERED";

                    // 주소 조합
                    $address = trim(($data['province'] ?? '') . ' ' . ($data['district'] ?? ''));

                    // 질문1, 질문2 매핑
                    $q1 = '';
                    $q2 = '';
                    if ($inquiry_type === 'item1') {
                        $q1 = $data['analysis_interest'] ?? '';
                        $q2 = $data['analysis_company'] ?? '';
                    } else if ($inquiry_type === 'item2') {
                        $q1 = $data['current_premium'] ?? '';
                        $q2 = $data['target_coverage'] ?? '';
                    } else if ($inquiry_type === 'item3') {
                        $q1 = $data['claim_reason'] ?? '';
                        $q2 = $data['hospital_name'] ?? '';
                    } else if ($inquiry_type === 'item4') {
                        $q1 = $data['concern_point'] ?? '';
                        $q2 = $data['check_request'] ?? '';
                    }

                    $siteUrl = '간편상담';
                    if (!empty($_SERVER['HTTP_REFERER'])) {
                        $siteUrl = $_SERVER['HTTP_REFERER'];
                    } else if (!empty($_SERVER['HTTP_HOST'])) {
                        $protocol = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http");
                        $siteUrl = $protocol . "://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
                    }

                    $values = [
                        date('Y-m-d H:i:s'), // A: 날짜
                        $siteUrl,            // B: 경로 (사이트 URL)
                        $path,               // C: 구분
                        $data['name'] ?? '', // D: 이름
                        $data['phone'] ?? '', // E: 연락처
                        $data['birthdate'] ?? '', // F: 생년월일
                        $data['gender'] ?? '', // G: 성별
                        $address,            // H: 주소
                        trim(($data['consult_time_type'] ?? '') . ' ' . ($data['consult_time'] ?? '')), // I: 상담가능시간
                        $q1,                 // J: 질문1
                        $q2,                 // K: 질문2
                        (isset($data['term_privacy']) && $data['term_privacy']) ? '동의' : '미동의', // L: 필수
                        (isset($data['term_marketing']) && $data['term_marketing']) ? '동의' : '미동의' // M: 선택
                    ];

                    $postData = json_encode(['values' => [$values]]);
                    
                    $ch = curl_init($url);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_POST, true);
                    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
                    curl_setopt($ch, CURLOPT_HTTPHEADER, [
                        'Authorization: Bearer ' . $accessToken,
                        'Content-Type: application/json'
                    ]);
                    
                    $sheetResponse = curl_exec($ch);
                    curl_close($ch);
                }
            }
        } catch (Exception $e) {
            error_log("Google Sheets API Error: " . $e->getMessage());
        }
        // 구글 시트 연동 로직 끝

        echo json_encode(["status" => "success", "message" => "신청이 성공적으로 저장되었습니다."]);
    } else {
        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "잘못된 요청 데이터입니다."]);
    }
} catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "DB 오류: " . $e->getMessage()]);
}
?>
