import time
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from markdownify import markdownify as md
from typing import Optional
from backend.app.core.debug import debug_manager

class WebExtractor:
    def __init__(self, headless: bool = True):
        self.options = Options()
        if headless:
            self.options.add_argument("--headless")
        self.options.add_argument("--no-sandbox")
        self.options.add_argument("--disable-dev-shm-usage")
        self.options.add_argument("--disable-gpu")
        self.options.add_argument("--window-size=1920,1080")
        self.options.add_argument("--disable-blink-features=AutomationControlled")
        self.options.add_experimental_option("excludeSwitches", ["enable-automation"])
        self.options.add_experimental_option("useAutomationExtension", False)
        self.options.add_argument("user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    def _clean_html(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        
        # Remove common non-content elements
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe", "noscript", "svg"]):
            tag.decompose()
            
        # Try to find the main content container, but avoid picking just one of many small articles
        # If there are multiple articles, we probably want their parent.
        potential_main = soup.find("main") or soup.find(id="content") or soup.find(id="main")
        
        if potential_main:
            content_to_parse = potential_main
        else:
            # If no clear main, use body but try to avoid header/footer which are already decomposed
            content_to_parse = soup.body or soup

        # Save prettified HTML for better debugging
        pretty_html = content_to_parse.prettify()
        debug_manager.save_data("cleaned_requests.html", pretty_html)
        # Convert to markdown
        markdown = md(str(content_to_parse), heading_style="ATX", strip=["img"])
        
        if not markdown:
            # Fallback to get_text if markdownify fails
            markdown = content_to_parse.get_text(separator="\n", strip=True)
        
        if not markdown:
            return ""

        # Basic cleanup of extra whitespace
        lines = [line.strip() for line in markdown.split("\n") if line.strip()]
        return "\n".join(lines)

    def fetch_content(self, url: str) -> str:
        """Fetch content from URL using requests with Selenium fallback."""
        debug_manager.create_session(url)
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code == 200:
                # Prettify raw HTML if it's a valid HTML
                try:
                    raw_soup = BeautifulSoup(response.text, "html.parser")
                    pretty_raw = raw_soup.prettify()
                    debug_manager.save_data("raw_requests.html", pretty_raw)
                except Exception:
                    debug_manager.save_data("raw_requests.html", response.text)
                
                if len(response.text) > 0:
                    cleaned = self._clean_html(response.text)
                    debug_manager.save_data("html_converted.md", cleaned)
                    return cleaned
        except Exception as e:
            debug_manager.log(f"Requests failed: {e}")

        # Fallback to Selenium
        debug_manager.log(f"Falling back to Selenium for {url}")
        driver = None
        try:
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=self.options)
            # Remove webdriver property
            driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            })
            driver.get(url)
            time.sleep(10)  # Wait longer for Wellfound
            html = driver.page_source
            
            # Prettify selenium HTML
            try:
                sel_soup = BeautifulSoup(html, "html.parser")
                debug_manager.save_data("selenium_html_extracted.html", sel_soup.prettify())
            except Exception:
                debug_manager.save_data("selenium_html_extracted.html", html)
                
            cleaned = self._clean_html(html)
            debug_manager.save_data("html_converted.md", cleaned)
            return cleaned
        except Exception as e:
            debug_manager.log(f"Selenium failed: {e}")
            return ""
        finally:
            if driver:
                driver.quit()
