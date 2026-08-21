import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

function extractDateFromUrl(url) {
    // URL에서 날짜 추출: /2026/08/14/ 또는 /20260814/ 패턴
    const m = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//) || url.match(/\/(\d{4})(\d{2})(\d{2})\//)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    return null
}

function todayDate() {
    return new Date().toISOString().split('T')[0]
}

function shuffleArray(items) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

async function scrapeWithBrowser(url, parserSelector) {
    const browser = await puppeteer.launch({ 
        headless: "new", // "new"로 하면 창이 안 뜨고 뒤에서 돕니다. 확인하고 싶으시면 false로 바꾸세요.
        args: ['--no-sandbox', '--window-size=1280,800'] 
    });
    const page = await browser.newPage();
    
    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        console.log(`🌐 접속 시도: ${url}`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});
        
        // 요즘IT의 경우 스크롤을 살짝 내려야 이미지가 로딩됩니다.
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 2000)); 

        const articles = await page.evaluate((selector) => {
            const results = [];
            
            if (selector === 'yozm') {
                // [요즘IT 정밀 타겟팅]
                // 작성자 링크 제외, 오직 기사 본문 링크(data-testid="contentsItem-item-link")만 찾습니다.
                const items = document.querySelectorAll('article'); // 각 기사 덩어리
                items.forEach(item => {
                    const linkEl = item.querySelector('a[data-testid="contentsItem-item-link"]');
                    const titleEl = item.querySelector('h3');
                    const summaryEl = item.querySelector('[data-testid="contentsItem-description"]');
                    const imgEl = item.querySelector('img');

                    if (linkEl && titleEl) {
                        results.push({
                            title: titleEl.innerText.trim(),
                            link: linkEl.href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: summaryEl?.innerText.trim() || titleEl.innerText.trim(),
                            source: 'YozmIT'
                        });
                    }
                });
            } else if (selector === 'aitimes') {
                // [AI 타임스 정밀 타겟팅]
                // .altlist-webzine-item 단위로 긁습니다.
                const items = document.querySelectorAll('.altlist-webzine-item');
                items.forEach(item => {
                    const titleEl = item.querySelector('.altlist-subject a');
                    const summaryEl = item.querySelector('.altlist-summary');
                    const imgEl = item.querySelector('.altlist-image img');

                    if (titleEl) {
                        results.push({
                            title: titleEl.innerText.trim(),
                            link: titleEl.href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: summaryEl?.innerText.trim() || titleEl.innerText.trim(),
                            source: 'AITimes'
                        });
                    }
                });
            } else if (selector === 'rundown') {
                // Rundown AI (기존 성공 로직 유지)
                document.querySelectorAll('main a').forEach(el => {
                    if (el.href.includes('/articles/')) {
                        const title = el.innerText.split('\n')[0].trim();
                        if (title.length > 5) {
                            results.push({ 
                                title, 
                                link: el.href, 
                                thumbnail: el.querySelector('img')?.src || '', 
                                summary: title, 
                                source: 'RundownAI' 
                            });
                        }
                    }
                });
            } else if (selector === 'dailytrend') {
                // DailyTrend 비즈니스트렌드 목록 크롤링
                const pushIfValid = (titleEl, summaryEl, imgEl) => {
                    if (!titleEl) return;
                    const href = titleEl.href || '';
                    const title = titleEl.innerText?.trim() || '';
                    if (!href || !title) return;

                    // 카테고리/로그인/회원가입 등 비기사 링크 제외
                    const blockedPaths = ['/category/', '/login', '/register', '/terms', '/privacy'];
                    if (!href.includes('dailytrend.co.kr')) return;
                    if (blockedPaths.some(path => href.includes(path))) return;

                    results.push({
                        title,
                        link: href,
                        thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                        summary: summaryEl?.innerText?.trim() || title,
                        source: 'DailyTrend'
                    });
                };

                // 1차: 기사 카드 단위 수집
                const items = document.querySelectorAll('article');
                items.forEach(item => {
                    const titleEl = item.querySelector('h2 a, h3 a, .entry-title a');
                    const summaryEl = item.querySelector('p, .excerpt, .entry-summary');
                    const imgEl = item.querySelector('img');
                    pushIfValid(titleEl, summaryEl, imgEl);
                });

                // 2차: 구조 변경 대비 fallback
                if (results.length === 0) {
                    document.querySelectorAll('main h2 a, main h3 a').forEach(linkEl => {
                        if (linkEl.closest('header, nav, footer')) return;
                        pushIfValid(linkEl, null, linkEl.closest('article, section, div')?.querySelector('img'));
                    });
                }
            } else if (selector === 'dailycar') {
                // 데일리카 - 자동차 전문 뉴스
                const items = document.querySelectorAll('li');
                items.forEach(item => {
                    const linkEl = item.querySelector('a[href*="type=view&autoId="]');
                    const imgEl = item.querySelector('img');
                    if (linkEl) {
                        const title = linkEl.innerText.trim();
                        if (title.length > 5) {
                            results.push({
                                title,
                                link: linkEl.href,
                                thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                                summary: title,
                                source: 'DailyCar'
                            });
                        }
                    }
                });
            } else if (selector === 'autoherald') {
                // 오토헤럴드 - 자동차 뉴스
                const items = document.querySelectorAll('.item');
                items.forEach(item => {
                    const linkEl = item.querySelector('a[href*="articleView"]');
                    const imgEl = item.querySelector('img');
                    if (linkEl) {
                        const title = linkEl.innerText.replace(/^\d+\s*/, '').trim();
                        if (title.length > 5) {
                            results.push({
                                title,
                                link: linkEl.href,
                                thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                                summary: title,
                                source: 'AutoHerald'
                            });
                        }
                    }
                });
            } else if (selector === 'motorgraph') {
                // 모터그래프 - 자동차 전문지 (JEMIN CMS 구조)
                const items = document.querySelectorAll('.type2 li, .article-list-content li, #section-list li');
                items.forEach(item => {
                    const titleEl = item.querySelector('.titles a, .list-titles a, h4 a');
                    const summaryEl = item.querySelector('.lead, .list-summary');
                    const imgEl = item.querySelector('img');
                    const dateEl = item.querySelector('em.replace-date, .byline em, .dated');
                    if (titleEl) {
                        const title = titleEl.innerText.trim();
                        if (title.length > 5) {
                            const dateText = dateEl?.innerText?.trim() || '';
                            const dm = dateText.match(/(\d{4})[.](\d{2})[.](\d{2})/);
                            results.push({
                                title,
                                link: titleEl.href,
                                thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                                summary: summaryEl?.innerText?.trim() || title,
                                source: 'MotorGraph',
                                published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                            });
                        }
                    }
                });
            } else if (selector === 'bobaedream') {
                // 보배드림 자동차뉴스
                const links = document.querySelectorAll('a[href*="/view?code=nnews&No="]');
                const seen = new Set();
                const year = new Date().getFullYear();
                links.forEach(linkEl => {
                    const title = linkEl.innerText.replace(/\[.*?\]/g, '').trim();
                    const href = linkEl.href;
                    if (title.length > 5 && !seen.has(href)) {
                        seen.add(href);
                        const row = linkEl.closest('tr, li, div');
                        const imgEl = row?.querySelector('img');
                        const dateEl = row?.querySelector('td.date, .date');
                        const dateText = dateEl?.innerText?.trim() || '';
                        const dm = dateText.match(/(\d{2})\/(\d{2})/);
                        results.push({
                            title,
                            link: href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: title,
                            source: 'Bobaedream',
                            published_at: dm ? `${year}-${dm[1]}-${dm[2]}` : ''
                        });
                    }
                });
            } else if (selector === 'danawa_auto') {
                // 다나와 자동차 뉴스
                const links = document.querySelectorAll('a[href*="Work=detail"]');
                const seen = new Set();
                links.forEach(linkEl => {
                    const title = linkEl.innerText.split('\n')[0].trim();
                    const href = linkEl.href;
                    if (title.length > 5 && !seen.has(href)) {
                        seen.add(href);
                        const parent = linkEl.closest('li, div, td');
                        const imgEl = parent?.querySelector('img');
                        results.push({
                            title,
                            link: href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: title,
                            source: 'DanawaAuto'
                        });
                    }
                });
            } else if (selector === 'encar_magazine') {
                // 엔카매거진 - 중고차 시세/트렌드
                const links = document.querySelectorAll('a[href*="/view/"]');
                const seen = new Set();
                links.forEach(linkEl => {
                    const href = linkEl.href;
                    if (seen.has(href) || !href.includes('encarmagazine.com')) return;
                    const title = linkEl.innerText.trim();
                    if (title.length > 5) {
                        seen.add(href);
                        const imgEl = linkEl.querySelector('img') || linkEl.closest('div, li, article')?.querySelector('img');
                        results.push({
                            title,
                            link: href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: title,
                            source: 'EncarMagazine'
                        });
                    }
                });
            } else if (selector === 'chosunbiz_auto') {
                // 조선비즈 자동차 - 금리, 경제, 완성차, 수입차 뉴스
                const items = document.querySelectorAll('[class*="story-card"]');
                const seen = new Set();
                items.forEach(item => {
                    const linkEl = item.querySelector('a[href*="/industry/car/"]');
                    if (!linkEl) return;
                    const href = linkEl.href;
                    if (seen.has(href)) return;
                    const title = linkEl.innerText.trim();
                    if (title.length > 5) {
                        seen.add(href);
                        const imgEl = item.querySelector('img');
                        results.push({
                            title,
                            link: href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: title,
                            source: 'ChosunBiz'
                        });
                    }
                });
                // fallback
                if (results.length === 0) {
                    document.querySelectorAll('a[href*="/industry/car/"]').forEach(linkEl => {
                        const href = linkEl.href;
                        if (seen.has(href)) return;
                        const title = linkEl.innerText.trim();
                        if (title.length > 10) {
                            seen.add(href);
                            results.push({
                                title,
                                link: href,
                                thumbnail: '',
                                summary: title,
                                source: 'ChosunBiz'
                            });
                        }
                    });
                }
            } else if (selector === 'molit') {
                // 국토교통부 보도자료 - 모빌리티·자동차
                const items = document.querySelectorAll('tr, .board_list li, .bbs_list li');
                items.forEach(item => {
                    const linkEl = item.querySelector('a[href*="dtl.jsp"], a[href*="DTL.jsp"], a[href*="lst.jsp"]');
                    if (!linkEl) return;
                    const title = linkEl.innerText.trim();
                    if (title.length > 5) {
                        results.push({
                            title,
                            link: linkEl.href,
                            thumbnail: '',
                            summary: title,
                            source: 'MOLIT'
                        });
                    }
                });
                // fallback: 테이블 구조
                if (results.length === 0) {
                    document.querySelectorAll('a').forEach(linkEl => {
                        const href = linkEl.href || '';
                        if (href.includes('dtl.jsp') || href.includes('DTL.jsp')) {
                            const title = linkEl.innerText.trim();
                            if (title.length > 5) {
                                results.push({
                                    title,
                                    link: href,
                                    thumbnail: '',
                                    summary: title,
                                    source: 'MOLIT'
                                });
                            }
                        }
                    });
                }
            } else if (selector === 'car_recall') {
                // 자동차리콜센터 - 리콜현황 (car.go.kr)
                document.querySelectorAll('a').forEach(a => {
                    const onclick = a.getAttribute('onclick') || '';
                    const text = a.innerText?.trim() || '';
                    if (onclick.includes('detailView') && text.length > 10) {
                        const idMatch = onclick.match(/detailView\('(\d+)'/);
                        const id = idMatch ? idMatch[1] : '';
                        results.push({
                            title: text.replace(/\n.*/s, '').trim(),
                            link: `https://www.car.go.kr/ri/stat/list.do#${id}`,
                            thumbnail: '',
                            summary: text.substring(0, 200),
                            source: 'CarRecall'
                        });
                    }
                });
            } else if (selector === 'car_recall_news') {
                // 자동차리콜센터 - 리콜보도자료
                document.querySelectorAll('a').forEach(a => {
                    const onclick = a.getAttribute('onclick') || '';
                    const text = a.innerText?.trim() || '';
                    if (onclick.includes('detailView') && text.length > 10) {
                        const idMatch = onclick.match(/detailView\('(\d+)'/);
                        const id = idMatch ? idMatch[1] : '';
                        results.push({
                            title: text.split('\n')[0].trim(),
                            link: `https://www.car.go.kr/sd/newsDta/list.do#${id}`,
                            thumbnail: '',
                            summary: text.substring(0, 300).replace(/\n/g, ' ').trim(),
                            source: 'CarRecallNews'
                        });
                    }
                });
            } else if (selector === 'fsc') {
                // 금융위원회 보도자료 - 금리, 금융정책
                document.querySelectorAll('.subject a, .board-list a').forEach(a => {
                    const href = a.href || '';
                    const text = a.innerText?.trim() || '';
                    if (href.includes('fsc.go.kr/no010101/') && text.length > 10) {
                        results.push({
                            title: text.replace(/\. 금일.*$/, '').trim(),
                            link: href.split('?')[0],
                            thumbnail: '',
                            summary: text.substring(0, 200),
                            source: 'FSC'
                        });
                    }
                });
            } else if (selector === 'kma') {
                // 기상청 보도자료 - 날씨, 기후
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    const text = a.innerText?.trim() || '';
                    if (href.includes('press') && href.includes('mode=view') && text.length > 10) {
                        results.push({
                            title: text,
                            link: href,
                            thumbnail: '',
                            summary: text,
                            source: 'KMA'
                        });
                    }
                });
            } else if (selector === 'knia') {
                // 손해보험협회 보도자료 - 자동차보험
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    const text = a.innerText?.trim() || '';
                    if (href.includes('/data/news/') && text.length > 10) {
                        results.push({
                            title: text,
                            link: href,
                            thumbnail: '',
                            summary: text,
                            source: 'KNIA'
                        });
                    }
                });
                // fallback: 게시판 구조
                if (results.length === 0) {
                    document.querySelectorAll('tr, .board-item, li').forEach(item => {
                        const linkEl = item.querySelector('a');
                        if (!linkEl) return;
                        const text = linkEl.innerText?.trim() || '';
                        const href = linkEl.href || '';
                        if (text.length > 10 && href.includes('knia.or.kr') && !href.includes('contribute') && !href.includes('report') && !href.includes('coins')) {
                            results.push({
                                title: text,
                                link: href,
                                thumbnail: '',
                                summary: text,
                                source: 'KNIA'
                            });
                        }
                    });
                }
            } else if (selector === 'opinet') {
                // 오피넷 - 유가 정보 (메인페이지에서 유종별 가격 추출)
                const priceDiv = document.querySelector('.oll_price');
                if (priceDiv) {
                    const text = priceDiv.innerText || '';
                    const dateMatch = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);
                    const pubDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : '';
                    const dateLabel = dateMatch ? `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]}` : '오늘';

                    // 전국평균 가격 추출
                    const gasMatch = text.match(/휘발유[\s\S]*?전국평균[\s\S]*?(\d{3,4}\.\d{2})\s*(▲|▼|-)?\s*([\d.]*)/);
                    const dieselMatch = text.match(/경유[\s\S]*?전국평균[\s\S]*?(\d{3,4}\.\d{2})\s*(▲|▼|-)?\s*([\d.]*)/);

                    // 전체 텍스트에서 가격 패턴 찾기
                    const prices = text.match(/\d{3,4}\.\d{2}/g) || [];
                    const arrows = text.match(/[▲▼]/g) || [];

                    if (prices.length > 0) {
                        const summary = `[${dateLabel}] 전국 평균 유가 | 휘발유: ${prices[0] || '-'}원 | 경유: ${prices[1] || '-'}원 | LPG: ${prices[2] || '-'}원`;
                        results.push({
                            title: `[주간유가] ${dateLabel} 전국 평균 기름값 - 휘발유 ${prices[0]}원`,
                            link: `https://www.opinet.co.kr/user/main/mainView.do#${pubDate}`,
                            thumbnail: '',
                            summary: summary,
                            source: 'Opinet',
                            published_at: pubDate
                        });
                    }
                }
            } else if (selector === 'fuel_news') {
                // 유가 관련 뉴스 (에너지경제, 유가, 기름값 뉴스)
                const seen = new Set();
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    const text = a.innerText?.trim() || '';
                    if (href.includes('/news/') && text.length > 10 && !seen.has(href)) {
                        seen.add(href);
                        const imgEl = a.querySelector('img') || a.closest('div, li')?.querySelector('img');
                        results.push({
                            title: text.substring(0, 200),
                            link: href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: text.substring(0, 200),
                            source: 'FuelNews'
                        });
                    }
                });
            } else if (selector === 'edaily') {
                // 이데일리 경제 - 금리, 환율, 무역, 경제동향
                const seen = new Set();
                document.querySelectorAll('a').forEach(a => {
                    const href = a.href || '';
                    const text = a.innerText?.trim() || '';
                    if (href.includes('edaily.co.kr/News/Read') && text.length > 10 && !seen.has(href)) {
                        seen.add(href);
                        const imgEl = a.querySelector('img') || a.closest('div, li')?.querySelector('img');
                        results.push({
                            title: text.substring(0, 200),
                            link: href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: text.substring(0, 200),
                            source: 'Edaily'
                        });
                    }
                });
            } else if (selector === 'etoday_fx') {
                // [환율] 이투데이 환율 시세 (유가 Opinet 방식 - 가격 데이터 수집)
                const pageText = document.body?.innerText || '';
                // 기준시간 추출: "08.21 13:27" 패턴
                const timeMatch = pageText.match(/(\d{2})\.(\d{2})\s+(\d{2}:\d{2})/);
                const year = new Date().getFullYear();
                const pubDate = timeMatch ? `${year}-${timeMatch[1]}-${timeMatch[2]}` : '';
                const dateLabel = timeMatch ? `${year}.${timeMatch[1]}.${timeMatch[2]} ${timeMatch[3]}` : '오늘';

                // 주요 통화별 매매기준율 추출
                const currencies = [];
                // 테이블/텍스트에서 통화별 가격 패턴 찾기
                const targetCodes = ['USD', 'EUR', 'JPY', 'CNY'];

                // 테이블 행에서 통화 코드 + 첫 번째 가격(매매기준율) 추출
                const rateMap = {};
                document.querySelectorAll('table tr').forEach(row => {
                    const text = row.innerText || '';
                    targetCodes.forEach(code => {
                        if (text.includes(code) && !rateMap[code]) {
                            const m = text.match(/(\d{1,2},?\d{1,3}\.\d{2})/);
                            if (m) rateMap[code] = m[1];
                        }
                    });
                });

                if (Object.keys(rateMap).length > 0) {
                    const usd = rateMap['USD'] || '-';
                    const eur = rateMap['EUR'] || '-';
                    const jpy = rateMap['JPY'] || '-';
                    const cny = rateMap['CNY'] || '-';

                    // 등락 정보 추출
                    const changeMatch = pageText.match(/USD[\s\S]*?(▲|▼)\s*([\d.]+)/);
                    const changeStr = changeMatch ? ` (${changeMatch[1]}${changeMatch[2]})` : '';

                    const summary = `[${dateLabel}] 매매기준율 | USD: ${usd}원 | EUR: ${eur}원 | JPY(100): ${jpy}원 | CNY: ${cny}원`;
                    results.push({
                        title: `[환율] ${dateLabel} 원/달러 ${usd}원${changeStr}`,
                        link: `https://www.etoday.co.kr/market/currencies#${pubDate}`,
                        thumbnail: '',
                        summary: summary,
                        source: 'EtodayFX',
                        published_at: pubDate
                    });
                }
            } else if (selector === 'autoview') {
                // [중고차 업계] 오토뷰 - 매매상사·딜러·플랫폼·업계 동향
                document.querySelectorAll('.article-card-list, a[href*="/ko-kr/articles/"]').forEach(el => {
                    const linkEl = el.tagName === 'A' ? el : el.querySelector('a');
                    if (!linkEl) return;
                    const href = linkEl.href || '';
                    if (!href.includes('/articles/')) return;
                    const titleEl = el.querySelector('.article-title-list, h2, h3');
                    const summaryEl = el.querySelector('.article-subtitle-list, p');
                    const imgEl = el.querySelector('img');
                    const dateEl = el.querySelector('.article-date-list, time');
                    const title = titleEl?.innerText?.trim() || linkEl.innerText?.trim() || '';
                    if (title.length > 5) {
                        const dateText = dateEl?.innerText?.trim() || '';
                        const dm = dateText.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
                        results.push({
                            title,
                            link: href,
                            thumbnail: imgEl?.currentSrc || imgEl?.src || '',
                            summary: summaryEl?.innerText?.trim() || title,
                            source: 'AutoView',
                            published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                        });
                    }
                });
            } else if (selector === 'moleg') {
                // [법규/제도] 법제처 입법예고 - 중고차·자동차 관련 법규만 필터링
                const molegKeywords = [
                    '자동차관리', '자동차등록', '자동차안전', '자동차검사',
                    '중고자동차', '중고차', '매매업', '매매사업', '성능점검', '성능상태',
                    '이전등록', '말소등록', '임시운행', '자동차세', '취득세',
                    '허위매물', '자동차보험', '배출가스', '도로교통',
                    '교통안전', '운전면허', '자율주행', '전기차', '전기자동차',
                    '자동차부품', '자동차손해', '대폐차', '압류', '저당'
                ];
                document.querySelectorAll('a[href*="makingInfo.mo"]').forEach(a => {
                    const href = a.href || '';
                    const text = a.innerText?.trim() || '';
                    if (text.length > 5 && href.includes('lawSeq')) {
                        // 중고차·자동차 관련 키워드 포함 여부 확인
                        const matched = molegKeywords.some(kw => text.includes(kw));
                        if (!matched) return;
                        const row = a.closest('tr, li, div');
                        const cells = row?.querySelectorAll('td') || [];
                        const dateText = cells.length > 3 ? cells[cells.length - 2]?.innerText?.trim() : '';
                        const dm = dateText.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
                        results.push({
                            title: text,
                            link: href,
                            thumbnail: '',
                            summary: text,
                            source: 'Moleg',
                            published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                        });
                    }
                });
            } else if (selector === 'kotsa') {
                // [법규/제도] 한국교통안전공단 보도자료 - 자동차검사, 성능점검 관련만 필터링
                const kotsaKeywords = [
                    '자동차', '중고차', '검사', '성능점검', '리콜', '안전기준',
                    '배출가스', '매연', '이륜', '전기차', '자율주행',
                    '운전', '면허', '교통사고', '교통안전', '사망',
                    '이전등록', '튜닝', '개조', '불법', '단속'
                ];
                document.querySelectorAll('tr').forEach(tr => {
                    const cells = tr.querySelectorAll('td');
                    if (cells.length < 3) return;
                    const linkEl = tr.querySelector('a');
                    if (!linkEl) return;
                    const text = linkEl.innerText?.trim() || '';
                    if (text.length < 10) return;
                    // 자동차·교통 관련 키워드 필터
                    const matched = kotsaKeywords.some(kw => text.includes(kw));
                    if (!matched) return;
                    const onclick = linkEl.getAttribute('onclick') || '';
                    const href = linkEl.href || '';
                    // fnView(bbscCode, cateCode, bbscSeqn) 패턴
                    const fnMatch = onclick.match(/fnView\([^,]*,[^,]*,\s*(\d+)/);
                    const seqn = fnMatch ? fnMatch[1] : '';
                    const finalLink = seqn
                        ? `https://main.kotsa.or.kr/portal/bbs/report_view.do?menuCode=05010200&bbscCode=report&bbscSeqn=${seqn}`
                        : href;
                    if (!finalLink || finalLink === '#' || finalLink.endsWith('#a')) {
                        if (!seqn) return;
                    }
                    const dateCell = cells[cells.length - 2] || cells[cells.length - 1];
                    const dateText = dateCell?.innerText?.trim() || '';
                    const dm = dateText.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
                    results.push({
                        title: text,
                        link: finalLink,
                        thumbnail: '',
                        summary: text,
                        source: 'KOTSA',
                        published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                    });
                });
            } else if (selector === 'customs') {
                // [수출/물류] 관세청 보도자료 - 수출입, 관세, 무역규제
                document.querySelectorAll('.nttInfoBtn, [data-id]').forEach(el => {
                    const nttSn = el.getAttribute('data-id') || '';
                    const text = el.innerText?.trim() || '';
                    if (!nttSn || text.length < 10) return;
                    const row = el.closest('tr');
                    const cells = row?.querySelectorAll('td') || [];
                    const dateCell = Array.from(cells).find(td => /\d{4}\.\d{2}\.\d{2}/.test(td.innerText));
                    const dateText = dateCell?.innerText?.trim() || '';
                    const dm = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
                    results.push({
                        title: text.split('\n')[0].trim(),
                        link: `https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=${nttSn}&bbsId=1362&mi=2891`,
                        thumbnail: '',
                        summary: text.substring(0, 200),
                        source: 'Customs',
                        published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                    });
                });
                // fallback: 테이블 구조에서 직접 추출
                if (results.length === 0) {
                    document.querySelectorAll('tr').forEach(tr => {
                        const cells = tr.querySelectorAll('td');
                        if (cells.length < 4) return;
                        const linkEl = tr.querySelector('a');
                        if (!linkEl) return;
                        const text = linkEl.innerText?.trim() || '';
                        const dataId = linkEl.getAttribute('data-id') || '';
                        if (text.length > 10 && dataId) {
                            const dateText = cells[cells.length - 2]?.innerText?.trim() || '';
                            const dm = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
                            results.push({
                                title: text,
                                link: `https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=${dataId}&bbsId=1362&mi=2891`,
                                thumbnail: '',
                                summary: text,
                                source: 'Customs',
                                published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                            });
                        }
                    });
                }
            } else if (selector === 'mof') {
                // [수출/물류] 해양수산부 보도자료 - 해운, 항만, 선적, 수출물류
                document.querySelectorAll('a[onclick*="fn_selectDoc"]').forEach(a => {
                    const onclick = a.getAttribute('onclick') || '';
                    const seqMatch = onclick.match(/fn_selectDoc\(\s*(\d+)/);
                    const text = a.innerText?.trim() || '';
                    if (!seqMatch || text.length < 10) return;
                    const docSeq = seqMatch[1];
                    const row = a.closest('tr');
                    const cells = row?.querySelectorAll('td') || [];
                    const dateCell = Array.from(cells).find(td => /\d{4}\.\d{2}\.\d{2}/.test(td.innerText));
                    const dateText = dateCell?.innerText?.trim() || '';
                    const dm = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
                    results.push({
                        title: text,
                        link: `https://www.mof.go.kr/doc/ko/selectDoc.do?docSeq=${docSeq}&menuSeq=971&bbsSeq=10`,
                        thumbnail: '',
                        summary: text,
                        source: 'MOF',
                        published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                    });
                });
                // fallback: 테이블 직접 파싱
                if (results.length === 0) {
                    document.querySelectorAll('tr').forEach(tr => {
                        const cells = tr.querySelectorAll('td');
                        if (cells.length < 4) return;
                        const linkEl = tr.querySelector('a');
                        if (!linkEl) return;
                        const text = linkEl.innerText?.trim() || '';
                        const href = linkEl.href || '';
                        if (text.length > 10 && href.includes('selectDoc')) {
                            const dateText = cells[cells.length - 2]?.innerText?.trim() || '';
                            const dm = dateText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
                            results.push({
                                title: text,
                                link: href,
                                thumbnail: '',
                                summary: text,
                                source: 'MOF',
                                published_at: dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : ''
                            });
                        }
                    });
                }
            }
            return results;
        }, parserSelector);

        await browser.close();
        // published_at이 없는 기사에 URL 날짜 또는 오늘 날짜 적용
        const today = todayDate();
        const enriched = articles.map(a => ({
            ...a,
            published_at: a.published_at || extractDateFromUrl(a.link) || today
        }));
        // 사이트당 최대 30건
        const limited = enriched.slice(0, 30);
        console.log(`✅ ${url} -> ${limited.length}건 수집 (원본 ${enriched.length}건)`);
        return limited;
    } catch (e) {
        console.error(`❌ 에러 발생:`, e.message);
        await browser.close();
        return [];
    }
}

async function main() {
    console.log('🚀 [HTML 분석 완료] 초정밀 크롤링을 시작합니다...');

    // === 기존 IT/비즈니스 뉴스 ===
    const [yozmBiz, yozmTrend, aiTimes, rundown, dailytrendBiz] = await Promise.all([
        scrapeWithBrowser('https://yozm.wishket.com/magazine/list/business/', 'yozm'),
        scrapeWithBrowser('https://yozm.wishket.com/magazine/list/trend/', 'yozm'),
        scrapeWithBrowser('https://www.aitimes.com/news/articleList.html?box_idxno=10&view_type=sm', 'aitimes'),
        scrapeWithBrowser('https://www.rundown.ai/articles', 'rundown'),
        scrapeWithBrowser('https://www.dailytrend.co.kr/category/business-trend/', 'dailytrend')
    ]);

    // === 자동차·중고차 시장 뉴스 ===
    const [dailycar, autoherald, motorgraph, bobaedream, danawaAuto, encarMag, chosunbiz, molit] = await Promise.all([
        // 1. 자동차 시장 - 신차, 리콜, 전기차, 하이브리드
        scrapeWithBrowser('https://www.dailycar.co.kr/content/news.html', 'dailycar'),
        // 2. 자동차 뉴스 - 수입차, 완성차, 리콜
        scrapeWithBrowser('https://www.autoherald.co.kr/news/articleList.html?sc_sub_section_code=S2N46&view_type=sm', 'autoherald'),
        // 3. 중고차 시세, 자동차 뉴스
        scrapeWithBrowser('https://www.motorgraph.com/news/articleList.html?sc_sub_section_code=S2N1', 'motorgraph'),
        // 4. 보배드림 자동차뉴스 - 커뮤니티 기반 자동차 뉴스
        scrapeWithBrowser('https://www.bobaedream.co.kr/list?code=nnews', 'bobaedream'),
        // 5. 다나와 자동차 뉴스 - 종합 자동차 뉴스
        scrapeWithBrowser('https://auto.danawa.com/news/', 'danawa_auto'),
        // 6. 엔카매거진 - 중고차 시세/트렌드
        scrapeWithBrowser('https://www.encarmagazine.com/', 'encar_magazine'),
        // 7. 조선비즈 자동차 - 금리, 경제, 완성차, 수입차
        scrapeWithBrowser('https://biz.chosun.com/car/', 'chosunbiz_auto'),
        // 8. 국토교통부 보도자료 - 정부정책, 자동차법, 배출가스규제
        scrapeWithBrowser('https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp?search_section=p_sec_12', 'molit')
    ]);

    // === 리콜·정책·금융·환경 뉴스 ===
    const [carRecall, carRecallNews, fsc, kma, knia, opinet, edaily] = await Promise.all([
        // 9. 리콜현황 - 자동차리콜센터
        scrapeWithBrowser('https://www.car.go.kr/ri/stat/list.do', 'car_recall'),
        // 10. 리콜보도자료 - 자동차리콜센터
        scrapeWithBrowser('https://www.car.go.kr/sd/newsDta/list.do', 'car_recall_news'),
        // 11. 금융위원회 보도자료 - 금리, 할부정책, 금융정책
        scrapeWithBrowser('https://www.fsc.go.kr/no010101', 'fsc'),
        // 12. 기상청 보도자료 - 날씨, 폭우, 태풍
        scrapeWithBrowser('https://www.kma.go.kr/kma/news/press.jsp', 'kma'),
        // 13. 손해보험협회 - 자동차보험, 보험료
        scrapeWithBrowser('https://www.knia.or.kr/data/news', 'knia'),
        // 14. 오피넷 - 주간 유가 (휘발유, 경유, LPG)
        scrapeWithBrowser('https://www.opinet.co.kr/user/main/mainView.do', 'opinet'),
        // 15. 이데일리 경제 - 금리, 환율, 무역, 경제동향
        scrapeWithBrowser('https://www.edaily.co.kr/economy', 'edaily')
    ]);

    // === [신규] 환율 뉴스 ===
    const [etodayFx] = await Promise.all([
        // 16. 이투데이 환율/외환 뉴스 - 원달러, 환율 동향
        scrapeWithBrowser('https://www.etoday.co.kr/market/currencies', 'etoday_fx')
    ]);

    // === [신규] 중고차 업계 동향 - 매매상사·딜러·플랫폼·인증중고차 ===
    const [autoview] = await Promise.all([
        // 17. 오토뷰 - 자동차 업계 뉴스, 딜러·매매상사·플랫폼 동향
        scrapeWithBrowser('https://www.autoview.co.kr/ko-kr/articles', 'autoview')
    ]);

    // === [신규] 법규/제도 - 자동차관리법, 성능점검, 매매업 등록, 세금 ===
    const [moleg, kotsa] = await Promise.all([
        // 18. 법제처 입법예고 - 자동차관리법, 도로교통법, 등록규칙 개정
        scrapeWithBrowser('https://www.moleg.go.kr/lawinfo/makingList.mo?mid=a10104010000', 'moleg'),
        // 19. 한국교통안전공단 보도자료 - 자동차검사, 성능점검, 교통안전
        scrapeWithBrowser('https://main.kotsa.or.kr/portal/bbs/report_list.do?menuCode=05010200', 'kotsa')
    ]);

    // === [신규] 수출/물류 - 중고차 수출, 해운, 항만, 관세 ===
    const [customs, mof] = await Promise.all([
        // 20. 관세청 보도자료 - 수출입 현황, 관세정책, 무역규제
        scrapeWithBrowser('https://www.customs.go.kr/kcs/na/ntt/selectNttList.do?bbsId=1362&mi=2891', 'customs'),
        // 21. 해양수산부 보도자료 - 해운운임, 항만물류, 선적, 수출규제
        scrapeWithBrowser('https://www.mof.go.kr/doc/ko/selectDocList.do?menuSeq=971&bbsSeq=10', 'mof')
    ]);

    const allArticles = [
        ...yozmBiz, ...yozmTrend, ...aiTimes, ...rundown, ...dailytrendBiz,
        ...dailycar, ...autoherald, ...motorgraph, ...bobaedream, ...danawaAuto, ...encarMag, ...chosunbiz, ...molit,
        ...carRecall, ...carRecallNews, ...fsc, ...kma, ...knia, ...opinet, ...edaily,
        ...etodayFx, ...autoview, ...moleg, ...kotsa, ...customs, ...mof
    ];
    const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.link, item])).values());
    const shuffledArticles = shuffleArray(uniqueArticles);

    console.log(`📊 최종 합계: ${shuffledArticles.length}건 (셔플 적용)`);

    if (shuffledArticles.length > 0) {
        const { data, error } = await supabase
            .from('news_feed')
            .upsert(shuffledArticles, { onConflict: 'link' })
            .select();

        if (error) console.error('❌ 저장 실패:', error.message);
        else console.log(`🎉 미션 완료! ${data.length}개의 데이터가 정확한 링크와 함께 저장되었습니다.`);
    }
}

main();