import * as cheerio from 'cheerio'
// @ts-ignore
import TurndownService from 'turndown'

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
})

/**
 * Scrapes a job page and converts its content to Markdown.
 * This is a generic scraper using cheerio for static content.
 */
export async function scrapeJobPage(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Falha ao carregar URL (Status ${response.status}): ${url}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)
    
    // Remove unnecessary elements to reduce noise for LLM
    $('script, style, iframe, nav, footer, header, noscript, svg, path, button, link, meta').remove()
    
    // Try to find the main content area
    let contentHtml = ''
    const selectors = ['main', 'article', '#job-description', '.job-description', '[role="main"]', 'body']
    
    for (const selector of selectors) {
      const el = $(selector)
      if (el.length > 0 && el.text().trim().length > 100) {
        contentHtml = el.html() || ''
        break
      }
    }
    
    if (!contentHtml) {
      contentHtml = $('body').html() || ''
    }

    // Convert HTML to clean Markdown
    const markdown = turndownService.turndown(contentHtml)
    
    // Remove extra whitespace and empty lines
    const cleanMarkdown = markdown
      .replace(/\n\s*\n/g, '\n\n')
      .trim()
      
    return cleanMarkdown
  } catch (error: any) {
    console.error('Scraping engine error:', error)
    throw new Error('Falha no scraping da página: ' + error.message)
  }
}
