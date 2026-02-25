import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import * as cheerio from 'cheerio'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

const axiosConfig = {
    headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    }
}

// 1. 요즘IT 크롤링 함수
async function crawlYozm(category) {
    try {
        const url = `https://yozm.wishket.com/magazine/list/${category}/`
        console.log(`🌐 요즘IT(${category}) 데이터를 가져오는 중...`)
        const { data: html } = await axios.get(url, axiosConfig)
        const $ = cheerio.load(html)
        const articles = []
        $('.list-item-link').each((i, el) => {
            const $el = $(el)
            const title = $el.find('.list-item-title').text().trim()
            const link = `https://yozm.wishket.com${$el.attr('href')}`
            let thumbnail = $el.find('.thumbnail-img').attr('src')
            if (thumbnail && !thumbnail.startsWith('http')) thumbnail = `https://yozm.wishket.com${thumbnail}`
            const summary = $el.find('.list-item-description').text().trim()
            if (title && link) {
                articles.push({ title, link, thumbnail: thumbnail || 'https://via.placeholder.com/400x200?text=Yozm+IT', summary, source: `YozmIT-${category}` })
            }
        })
        return articles
    } catch (e) {
        console.error(`❌ 요즘IT(${category}) 에러:`, e.message); return []
    }
}

// 2. Rundown AI 크롤링 함수
async function crawlRundownAI() {
    try {
        console.log('🌐 The Rundown AI 데이터를 가져오는 중...')
        const { data: html } = await axios.get('https://www.rundown.ai/articles', axiosConfig)
        const $ = cheerio.load(html)
        const articles = []
        $('main a').each((i, el) => {
            const $el = $(el)
            const href = $el.attr('href') || ''
            if (href.includes('/articles/')) {
                const title = $el.find('h2, h3, h4, p').first().text().trim()
                const link = href.startsWith('http') ? href : `https://www.rundown.ai${href}`
                const thumbnail = $el.find('img').attr('src')
                if (title && title.length > 3) {
                    articles.push({ title, link, thumbnail: thumbnail || 'https://via.placeholder.com/400x200?text=Rundown+AI', summary: 'The Rundown AI 최신 아티클', source: 'RundownAI' })
                }
            }
        })
        return articles
    } catch (e) {
        console.error('❌ Rundown AI 에러:', e.message); return []
    }
}

// 3. AI 타임스 크롤링 함수 (NEW!)
async function crawlAITimes() {
    try {
        console.log('🌐 AI 타임스 데이터를 가져오는 중...')
        const url = 'https://www.aitimes.com/news/articleList.html?box_idxno=10&view_type=sm'
        const { data: html } = await axios.get(url, axiosConfig)
        const $ = cheerio.load(html)
        const articles = []

        // AI 타임스 리스트 아이템 선택자
        $('.user-focus .list-block').each((i, el) => {
            const $el = $(el)
            const title = $el.find('.list-titles strong').text().trim()
            const relativeLink = $el.find('a').attr('href')
            const link = `https://www.aitimes.com${relativeLink}`
            const thumbnail = $el.find('.list-image').css('background-image')?.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
            const summary = $el.find('.list-summary').text().trim()

            if (title && link) {
                articles.push({
                    title,
                    link,
                    thumbnail: thumbnail || 'https://via.placeholder.com/400x200?text=AI+Times',
                    summary: summary.substring(0, 150) || 'AI 타임스 최신 소식',
                    source: 'AITimes'
                })
            }
        })
        return articles
    } catch (e) {
        console.error('❌ AI 타임스 에러:', e.message); return []
    }
}

// 4. 메인 실행 함수
async function main() {
    // 4곳의 데이터를 병렬로 동시 수집
    const [yozmBiz, yozmTrend, rundownDocs, aiTimesDocs] = await Promise.all([
        crawlYozm('business'),
        crawlYozm('trend'),
        crawlRundownAI(),
        crawlAITimes()
    ])
    
    const allArticles = [...yozmBiz, ...yozmTrend, ...rundownDocs, ...aiTimesDocs]
    
    // 중복 제거
    const uniqueArticles = Array.from(new Map(allArticles.map(item => [item.link, item])).values())

    console.log(`🔎 총 ${uniqueArticles.length}건의 유니크 아티클 수집 완료.`)

    if (uniqueArticles.length > 0) {
        const { data, error } = await supabase
            .from('news_feed')
            .upsert(uniqueArticles, { onConflict: 'link' })
            .select()

        if (error) console.error('❌ Supabase 저장 실패:', error.message)
        else console.log(`✅ 성공! ${data.length}개의 데이터를 DB에 동기화했습니다.`)
    }
}

main()