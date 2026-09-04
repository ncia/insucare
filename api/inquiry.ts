import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

// Google Service Account Credentials
const DEFAULT_GOOGLE_CLIENT_EMAIL = 'fintos@project-fintos.iam.gserviceaccount.com';
const DEFAULT_GOOGLE_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDXacTlZUlqQtQ+
1neSHtySJPc11L6c2mQ8cGjuXkCMefKovyMZLlZtr6eps7U21QaFCYIz/EoSV6TI
vR3TQmfcauuf+dm4wZAaPGLVEUDUExyIcYVjUSfd4p5c9Z+qns8iTacttQ5GdKbn
Pq2OIPWK4ZffYg2dwuT8YBEf4f02c+j+5pQITGXuNlllZ0hADwym61K3YUl7ForY
auodSkQ0tuWHKlQde8h0X8bkJdVR67gNdjdaPo+37kKaQ01BsJ0KSsPpCGa4hq+y
E1xk/FHgRD6rICi0arXzh+DrHdEXd5/kXvrEW17m/jxWJZr3qsbEBx1+iq6qbQYC
okB7PDAhAgMBAAECggEAA8KiR+PA3to4C+x3PzpRibqotvxsQxij9lluSxcjQhIb
/uwoPXeQojh8rfKq9tNls9z4WrZpNIEDnMGO+g0Ix/RoKAPTtCnEo9Q0RvZWqjHd
T7hVY2HE9zbH1cUi/B0RB7vXVfqyqAVZbdDrQdKend9Y61+FL8dZgADTmuZ/yRg/
o71jhJKnZ7stm1G7kSxKHqPNN+7YeP2MRwxKeg7HzGuXFMptGDESAcKWaykemH8P
pfDminMdSoPzh7lH0mreOtgKXfeaPqel6O2Sh0JBRUFC00gFcBr3Mc5H8IW5MXgo
UveLhwaQM87OdGAjsGUtyHJEbofJj00uZqViG4LMuQKBgQDvyY6rQPVgk8bIxy9R
nETopDTyxivuDab9h421gct14wEmVUu5EHo+2+z8EEy1YcNqsbFP0r6BBmQebjsh
eQRsit+sOYIRcz/o1IOLx4gglfl4mpuCjLz/qHuNUFEmeNqWcOXCHbJHbqDgOjvo
fMYuoEPT0I0Mk8lHRVx3o0IT6QKBgQDl+lKtSsRjcmTtY3yRtknWYLPpUxDqKzNP
Co0OZhRZ1biFcwTYjOTCxJJfBq4yyvtdUYgqbmigAQIT/7kJBuwk1iiitRvqfDsQ
jwh/u0UA+FzCFUYphQS1dG89eoGh6TDOR8tvpj42VEBphcZcRR3fmd0az65MFwtf
fwRxSfEveQKBgQDLUerJR1FIzMUXZd23o3vCj8nduS9ysNzRyOjd6OquUQeei2Cj
0Vb2ieDOcru4aOccRwOEHbwvB05Jh0pYPZcEulSiYjjptwGP2PKZyVyh1Mkt/Fq0
PcXcOe5ZiqrkpkEioyQOjsOmUiXTO02k+nfI/VfF+OZAredTqXqYbzQOUQKBgQC8
lm+h54PwQOh+umx2WNNn1tjx5soiHNbwZCiTvCXIHTg5Rr6cjb0x8lxNTH8g688B
EVDl6rAlNW5s0/D6dBDFjFC6TGXd/Y254HEJvZmyV/hIt4VXmtrnqdlmwsT27vC0
1679mYe+qYxAfBDTrWH38Iad69x0TRlocBJGjGoZkQKBgBoaWz+2a+xognUbpLpG
kghdZyg8h5WDcZU72KCW2vwJt4k/bCs5VGDA30Lwv2iaMrY1wuZemtRR3Krfi6t4
nYjNlcoOz5lajMEYxKsXmvj8E7/7jF+UQwjD2iOL41X2S4dOgimjvjKOMDW6P8an
5h+MtcR/7Bgn6pUi4R8G0mKi
-----END PRIVATE KEY-----`;

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1t3OElFyO6HlUm7qtf8ASE5PTEk5qAq6IzALsaV4XSA0';

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const header = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const claim = JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  });

  const b64Header = base64url(header);
  const b64Claim = base64url(claim);

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(b64Header + '.' + b64Claim);
  const signature = sign.sign(privateKey, 'base64');
  const b64Signature = signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${b64Header}.${b64Claim}.${b64Signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`Google OAuth Token Error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

async function resolveSheetTitle(accessToken: string, spreadsheetId: string, baseTitle: string): Promise<string> {
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const sheetTitles: string[] = meta.sheets?.map((s: any) => s.properties?.title) || [];
      
      // 1. 정확히 일치하는 경우
      const exact = sheetTitles.find((t) => t === baseTitle);
      if (exact) return exact;
      
      // 2. 이모지(🔴 등) 또는 공백을 제외하고 일치하는 탭 검색
      const cleanBase = baseTitle.replace(/[^a-zA-Z0-9가-힣]/g, '');
      const matched = sheetTitles.find((t) => {
        const cleanTitle = t.replace(/[^a-zA-Z0-9가-힣]/g, '');
        return cleanTitle === cleanBase || t.includes(baseTitle) || baseTitle.includes(t);
      });
      if (matched) return matched;
    }
  } catch (err) {
    console.error('Failed to resolve sheet title:', err);
  }
  return baseTitle;
}

export default async function handler(req: any, res: any) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    let data = req.body;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // keep as is
      }
    }

    if (!data) {
      return res.status(400).json({ status: 'error', message: '요청 데이터가 없습니다.' });
    }

    const inquiry_type = data.inquiry_type || '';
    let path = '기타';
    if (inquiry_type === 'item1') path = '보험분석 상담';
    else if (inquiry_type === 'item2') path = '보험 리모델링';
    else if (inquiry_type === 'item3') path = '보험금 청구';
    else if (inquiry_type === 'item4') path = '내보험 점검';

    let gender = data.gender || '';
    if (gender === 'male') gender = '남성';
    else if (gender === 'female') gender = '여성';

    const address = `${data.province || ''} ${data.district || ''}`.trim();
    const consultTime = `${data.consult_time_type || ''} ${data.consult_time || ''}`.trim();

    let q1 = '';
    let q2 = '';
    if (inquiry_type === 'item1') {
      q1 = data.analysis_interest || '';
      q2 = data.analysis_company || '';
    } else if (inquiry_type === 'item2') {
      q1 = data.current_premium || '';
      q2 = data.target_coverage || '';
    } else if (inquiry_type === 'item3') {
      q1 = data.claim_reason || '';
      q2 = data.hospital_name || '';
    } else if (inquiry_type === 'item4') {
      q1 = data.concern_point || '';
      q2 = data.check_request || '';
    }

    const siteUrl = req.headers['referer'] || (req.headers['host'] ? `https://${req.headers['host']}` : '간편상담');

    // KST formatted date string (YYYY-MM-DD HH:mm:ss)
    const now = new Date();
    const kstDateStr = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now).replace(/\. /g, '-').replace(/\./g, '');

    const values = [
      kstDateStr,                                               // A: 날짜
      siteUrl,                                                  // B: 경로 (사이트 URL)
      path,                                                     // C: 구분
      data.name || '',                                          // D: 이름
      data.phone || '',                                         // E: 연락처
      data.birthdate || '',                                     // F: 생년월일
      gender,                                                   // G: 성별
      address,                                                  // H: 주소
      consultTime,                                              // I: 상담가능시간
      q1,                                                       // J: 질문1
      q2,                                                       // K: 질문2
      data.term_privacy ? '동의' : '미동의',                     // L: 필수
      data.term_marketing ? '동의' : '미동의'                   // M: 선택
    ];

    // Google Sheets Integration
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || DEFAULT_GOOGLE_CLIENT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || DEFAULT_GOOGLE_PRIVATE_KEY).replace(/\\n/g, '\n');

    const accessToken = await getGoogleAccessToken(clientEmail, privateKey);
    const baseRangeName = '간편상담CARE';
    const rangeName = await resolveSheetTitle(accessToken, SPREADSHEET_ID, baseRangeName);
    const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(rangeName)}:append?valueInputOption=USER_ENTERED`;

    const sheetRes = await fetch(sheetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values: [values]
      })
    });

    if (!sheetRes.ok) {
      const errText = await sheetRes.text();
      console.error('Google Sheets API append failed:', errText);
      throw new Error(`Google Sheets API Error: ${errText}`);
    }

    return res.status(200).json({
      status: 'success',
      message: '신청이 성공적으로 저장되었습니다.'
    });
  } catch (error: any) {
    console.error('Inquiry API Error:', error);
    return res.status(500).json({
      status: 'error',
      message: error?.message || '신청 처리 중 서버 오류가 발생했습니다.'
    });
  }
}
