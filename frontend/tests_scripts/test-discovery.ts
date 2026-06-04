import * as dotenv from 'dotenv';
import path from 'path';

// Load env variables BEFORE other imports
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { discoveryService } from '../src/lib/scraping/discovery';

async function testDiscovery() {
  const url = 'https://remoteok.com/remote-python-jobs?location=Worldwide';
  
  console.log(`Starting AI Selector Discovery for: ${url}`);
  console.log(`Using Model: ${process.env.OLLAMA_MODEL || 'gemma'}`);
  
  try {
    const selectors = await discoveryService.discoverSelectors(url);
    
    console.log('\n--- Discovered Selectors ---');
    console.log(JSON.stringify(selectors, null, 2));
    console.log('----------------------------\n');

  } catch (error) {
    console.error('Discovery test failed:', error);
  } finally {
    process.exit(0);
  }
}

testDiscovery();
