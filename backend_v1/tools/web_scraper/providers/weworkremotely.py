from ..base import BaseExtractor
from ..extractor import WebExtractor
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from backend.app.core.debug import debug_manager

class WeWorkRemotelyExtractor(BaseExtractor):
    def __init__(self):
        self.web_extractor = WebExtractor()

    def fetch(self, url: str) -> str:
        debug_manager.log("Using WeWorkRemotelyExtractor")
        # 1. Obtém o conteúdo bruto usando o WebExtractor base
        # Nota: Precisamos do HTML bruto para filtrar antes da limpeza genérica
        import requests
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        debug_manager.create_session(url)
        try:
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                debug_manager.log(f"WWR Custom Fetch failed with status {response.status_code}")
                return self.web_extractor.fetch_content(url)
            
            raw_html = response.text
            debug_manager.save_data("wwr_raw_html.html", raw_html)
        except Exception as e:
            debug_manager.log(f"WWR Custom Fetch error: {e}")
            return self.web_extractor.fetch_content(url)

        # 2. Parse específico para WeWorkRemotely
        soup = BeautifulSoup(raw_html, "html.parser")
        job_sections = soup.find_all("section", class_="jobs")
        
        if not job_sections:
            debug_manager.log("No <section class='jobs'> found, falling back to generic extractor")
            return self.web_extractor.fetch_content(url)

        # 3. Une apenas as seções de interesse
        cleaned_html = soup.new_tag("div")
        for section in job_sections:
            cleaned_html.append(section)
        debug_manager.save_data("wwr_cleaned_html.html", str(cleaned_html))

        # 4. Converte para Markdown
        markdown = md(str(cleaned_html), heading_style="ATX", strip=["img"])
        
        # Cleanup extra whitespace
        lines = [line.strip() for line in markdown.split("\n") if line.strip()]
        cleaned_markdown = "\n".join(lines)
        
        debug_manager.save_data("wwr_custom_markdown.md", cleaned_markdown)
        return cleaned_markdown

    def get_prompt_extension(self) -> str:
        return """
        Specific instructions for WeWorkRemotely (Markdown context):
        - Jobs are grouped under Markdown headers (e.g., '## Full-Stack Programming Jobs').
        - Each job entry is represented as a Markdown link block `[...] (URL)`.
        - Inside this link block, you will find:
            - The Job Title, prefixed with '### ' (Markdown H3).
            - The Company Name (usually the line immediately following the job title or date).
            - Location and Region (Look for country names, flags, or 'Anywhere in the World').
            - Job Type (e.g., 'Full-Time', 'Contract').
            - Salary range if listed (e.g., '$50,000 - $74,999 USD').
        - The Job URL is the destination of the main Markdown link containing the job title.
        - Look for 'New' or 'Featured' labels within the entry to identify recently posted or priority jobs.

        CRITICAL VALIDATION RULES:
        1. A job is ONLY valid if it is remote.
        2. The allowed work location MUST be one of the following:
           - "Anywhere in the World"
           - "Brazil" (or 🇧🇷 Brazil)
           - "South America"
        3. BE EXTREMELY STRICT: If a job lists specific regions or countries that DO NOT include the ones above, it MUST be EXCLUDED.
           - Examples of restricted locations to EXCLUDE: "USA Only", "Europe Only", "UK Only", "Canada", "Latvia", "Vienna, Austria", "San Francisco, CA", "London, UK", "New York, NY", "Poland", "Sweden", "Germany", "France", "Spain", "Italy", "Albania", "Austria", "Belgium", "Bulgaria", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "Greece", "Croatia", "Hungary", "Ireland", "Lithuania", "Luxembourg", "Latvia", "Malta", "Netherlands", "Portugal", "Romania", "Slovakia", "Slovenia".
        4. If you see any specific city or country mentioned that is not Brazil, and it doesn't say "Anywhere in the World", the job is restricted and MUST be EXCLUDED.
        5. If a list of countries is provided (using flags or names), ONLY include the job if "Brazil" or "South America" is explicitly in that list.
        """
