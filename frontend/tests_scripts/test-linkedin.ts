import { LinkedInScraper } from '../src/lib/scraping/providers/linkedin';

async function testLinkedIn() {
  const scraper = new LinkedInScraper();
  // Using a standard guest search URL
  const url = 'https://www.linkedin.com/jobs/search?keywords=Python&location=Remote&f_WT=2';

  console.log(`Starting test scrape for LinkedIn: ${url}`);
  
  try {
    const result = await scraper.scrape(url, { 
      maxPages: 2, // Test 2 pages
      itemsPerPage: 25 
    });
    
    console.log('--- LinkedIn Scrape Result ---');
    console.log(`Total Found: ${result.metadata.totalFound}`);
    console.log(`Processed: ${result.metadata.processedCount}`);
    console.log(`Pages: ${result.metadata.pagesProcessed}`);
    console.log(`Duration: ${result.metadata.duration}ms`);
    
    console.log('\nSample Jobs (1st from each page potentially):');
    result.jobs.slice(0, 5).forEach((job, i) => {
      console.log(`${i + 1}. ${job.title} at ${job.company}`);
      console.log(`   Location: ${job.location}`);
      console.log(`   URL: ${job.url}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testLinkedIn();
