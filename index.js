import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

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
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
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
            }
            return results;
        }, parserSelector);

        await browser.close();
        console.log(`✅ ${url} -> ${articles.length}건 수집 성공`);
        return articles;
    } catch (e) {
        console.error(`❌ 에러 발생:`, e.message);
        await browser.close();
        return [];
    }
}

async function main() {
    console.log('🚀 [HTML 분석 완료] 초정밀 크롤링을 시작합니다...');

    const [yozmBiz, yozmTrend, aiTimes, rundown, dailytrendBiz] = await Promise.all([
        scrapeWithBrowser('https://yozm.wishket.com/magazine/list/business/', 'yozm'),
        scrapeWithBrowser('https://yozm.wishket.com/magazine/list/trend/', 'yozm'),
        scrapeWithBrowser('https://www.aitimes.com/news/articleList.html?box_idxno=10&view_type=sm', 'aitimes'),
        scrapeWithBrowser('https://www.rundown.ai/articles', 'rundown'),
        scrapeWithBrowser('https://www.dailytrend.co.kr/category/business-trend/', 'dailytrend')
    ]);

    const allArticles = [...yozmBiz, ...yozmTrend, ...aiTimes, ...rundown, ...dailytrendBiz];
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