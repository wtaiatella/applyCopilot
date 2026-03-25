from .base import BaseExtractor
from .extractor import WebExtractor
from .providers.weworkremotely import WeWorkRemotelyExtractor

class GenericExtractor(BaseExtractor):
    def __init__(self):
        self.web_extractor = WebExtractor()

    def fetch(self, url: str) -> str:
        self.log("Using GenericExtractor")
        return self.web_extractor.fetch_content(url)

    def get_prompt_extension(self) -> str:
        return ""

def get_extractor_for_url(url: str) -> BaseExtractor:
    if "weworkremotely.com" in url:
        return WeWorkRemotelyExtractor()
    # Adicione novos provedores aqui
    return GenericExtractor()
