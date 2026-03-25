from abc import ABC, abstractmethod

class BaseExtractor(ABC):
    @abstractmethod
    def fetch(self, url: str) -> str:
        """Coleta o conteúdo bruto ou processado do site."""
        pass

    @abstractmethod
    def get_prompt_extension(self) -> str:
        """Retorna instruções específicas de prompt para este site, se houver."""
        return ""
