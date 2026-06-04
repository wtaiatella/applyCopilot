import { GenericScraper } from '../src/lib/scraping/generic-scraper';

async function testWWR() {
  const selectors = {
    container: 'section.jobs',
    item: 'li',
    title: '.new-listing__header__title__text',
    company: '.new-listing__company-name',
    url: 'a[href^="/remote-jobs/"]',
    location: '.new-listing__categories__category', // We'll take all as tags
    technologies: '.new-listing__categories__category',
    postedAt: '.new-listing__header__icons__date'
  };

  const scraper = new GenericScraper(selectors);
  const url = 'https://weworkremotely.com/categories/remote-full-stack-programming-jobs';

  console.log(`Starting test scrape for: ${url}`);
  
  try {
    const result = await scraper.scrape(url);
    
    console.log('--- Scrape Result ---');
    console.log(`Total Found: ${result.metadata.totalFound}`);
    console.log(`Processed: ${result.metadata.processedCount}`);
    console.log(`Duration: ${result.metadata.duration}ms`);
    console.log('\nTop 3 Jobs with Details:');
    
    result.jobs.slice(0, 3).forEach((job, i) => {
      console.log(`${i + 1}. ${job.title} at ${job.company}`);
      console.log(`   Location/Tags: ${job.technologies.join(' | ')}`);
      console.log(`   Posted: ${job.postedAtRaw}`);
      console.log(`   URL: ${job.url}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testWWR();
