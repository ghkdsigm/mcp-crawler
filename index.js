import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as cheerio from 'cheerio'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

async function crawlRundownAI() {
    try {
        console.log('🌐 The Rundown AI에서 진짜 데이터를 가져오는 중...')
        
        // 1. 헤더 정보를 좀 더 사람처럼(Browser-like) 설정해서 차단 방지
        const { data: html } = await axios.get('https://www.rundown.ai/articles', {
            headers: {
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        })
        
        const $ = cheerio.load(html)
        const articles = []

        // 2. 더 유연한 파싱 로직
        // Rundown AI는 보통 <main> 안의 <a> 태그들이 기사 링크입니다.
        $('main a').each((i, el) => {
            const $el = $(el)
            const href = $el.attr('href') || ''
            
            // 링크에 '/articles/'가 포함된 것들만 필터링
            if (href.includes('/articles/')) {
                const title = $el.find('h2, h3, h4, p').first().text().trim() // 제목이 될 만한 요소들 다 뒤짐
                const link = href.startsWith('http') ? href : `https://www.rundown.ai${href}`
                const thumbnail = $el.find('img').attr('src')
                const summaryText = $el.find('p').last().text().trim()

                // 제목이 있고 너무 짧지 않은 경우만 저장
                if (title && title.length > 3) {
                    articles.push({
                        title,
                        link,
                        thumbnail: thumbnail || 'https://via.placeholder.com/400x200?text=Rundown+AI',
                        summary: summaryText || 'The Rundown AI 최신 아티클'
                    })
                }
            }
        })

        // 중복 링크 제거
        const uniqueArticles = Array.from(new Map(articles.map(item => [item.link, item])).values())

        console.log(`🔎 총 ${uniqueArticles.length}건의 아티클을 발견했습니다.`)

        if (uniqueArticles.length === 0) {
            console.log('⚠️ 여전히 데이터를 찾지 못했습니다.');
            // 로그 출력을 위해 HTML 구조를 살짝 출력해볼 수 있습니다 (디버깅용)
            // console.log($('body').text().substring(0, 500)); 
            return;
        }

        // 3. Supabase upsert
        const { data, error } = await supabase
            .from('news_feed')
            .upsert(uniqueArticles, { onConflict: 'link' })
            .select()

        if (error) throw error
        console.log(`✅ 성공! ${data.length}개의 데이터를 DB에 동기화했습니다.`);

    } catch (error) {
        console.error('❌ 에러 발생:', error.message)
    }
}

crawlRundownAI()