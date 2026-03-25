import os
import datetime
from urllib.parse import urlparse
from typing import Optional

class DebugManager:
    """
    Gerenciador de depuração para registrar logs e salvar arquivos intermediários.
    """
    def __init__(self, enabled: bool = False):
        self.enabled = enabled or os.getenv("DEBUG", "false").lower() == "true"
        self.session_path: Optional[str] = None

    def create_session(self, url: str):
        if not self.enabled:
            return
        
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M")
        domain = urlparse(url).netloc.replace(".", "_")
        if not domain:
            domain = "unknown"
            
        folder_name = f"{timestamp}-{domain}"
        self.session_path = os.path.join("logs", folder_name)
        os.makedirs(self.session_path, exist_ok=True)
        self.log(f"Debug session started for: {url}")
        self.log(f"Files will be saved in: {self.session_path}")

    def save_data(self, filename: str, content: str):
        if not self.enabled or not self.session_path:
            return
        
        path = os.path.join(self.session_path, filename)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            self.log(f"Saved: {filename}")
        except Exception as e:
            self.log(f"Error saving {filename}: {e}")

    def log(self, message: str):
        # Print padrão no console
        print(f"[DEBUG] {message}")
        
        # Se habilitado, também registra em um arquivo de log geral na pasta da sessão
        if self.enabled and self.session_path:
            log_file = os.path.join(self.session_path, "session.log")
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"[{timestamp}] {message}\n")

# Instância global para facilitar o acesso, mas permitindo injeção se necessário
debug_manager = DebugManager()
